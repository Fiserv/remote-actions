#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");
const args = process.argv.slice(2);
const folder = args?.[0];
const YAML_VALIDATOR = "YAML VALIDATOR";
const showdown = require("showdown");
const {
  errorMsg,
  errorMessage,
  printMessage,
  provideReferenceFolder,
} = require("./utils/tools");
const { enrichHTMLFromMarkup, showdownHighlight } = require("./utils/md-utils");

const validateDir = async (dir, apiList) => {
  if (!apiList?.length || !apiList[0]?.apiSpecFileNames?.length) {
    errorMessage(YAML_VALIDATOR, "No API version found in tenant.json");
    return false;
  }

  apiList.forEach((version) => {
    let checkedApis = {};
    version.apiSpecFileNames.forEach(async (fileName) => {
      let file = `${dir}/${version.version}/${fileName}.yaml`;
      if (!fs.existsSync(file)) {
        errorMsg(`${file} - Missing`);
        return;
      }
      try {
        const content = fs.readFileSync(file, "utf8");
        const apiJson = yaml.load(content);
        const tenantName = args[0].split("/").pop();
        file = file.split(`/${tenantName}/`)[1];
        if (!apiJson.paths || !Object.keys(apiJson.paths).length) {
          errorMessage(YAML_VALIDATOR, "No path provided!");
        }
        if (!apiJson?.openapi || apiJson.openapi < "3.0.0" || apiJson.openapi > "3.0.3") {
          errorMessage(
            YAML_VALIDATOR,
            `File: ${fileName}.yaml - Error: OpenAPI version must be defined and versioned between 3.0.0 and 3.0.3`
          );
          return;
        }
        const validatedJson = await SwaggerParser.validate(apiJson);

        if (validatedJson) {
          parseAPIData(file, validatedJson, checkedApis);
        }
      } catch (e) {
        errorMessage(YAML_VALIDATOR, `File : ${fileName} : FAILED`);
        errorMsg(`Error: ${e?.message}`);
      }
    });
  });

  return true;
};

const parseAPIData = (fileName, apiJson, checkedApis) => {
  let check = true;
  try {
    for (const [path, obj] of Object.entries(apiJson.paths)) {
      for (const [reqType, api] of Object.entries(obj)) {
        if (typeof api !== "object" || api === null) {
          continue;
        }
        if (!api["x-proxy-name"]) {
          errorMessage(
            YAML_VALIDATOR,
            `File :${fileName} API-Path:${path} Error: Missing 'x-proxy-name'`
          );
          check = false;
        }
        const version = fileName.split("/")[1];
        check &= validateIndexBody(
          fileName,
          apiJson,
          path,
          reqType,
          api,
          version,
          checkedApis
        );
      }
    }
    if (check) {
      printMessage(`File: ${fileName} : PASSED`);
    } else {
      errorMsg(`Validation error in file ${fileName}`);
    }
  } catch (e) {
    errorMsg(`Error: ${e?.message}`);
  }
  return check;
};

const validateIndexBody = (
  fileName,
  yamlData,
  path,
  reqType,
  api,
  version,
  checkedApis
) => {
  try {
    const pathJSON = yamlData.paths[path][reqType];
    const converter = new showdown.Converter({
      ghCompatibleHeaderId: true,
      emoji: true,
      disableForced4SpacesIndentedSublists: true,
      literalMidWordUnderscores: true,
      tables: true,
      extensions: [enrichHTMLFromMarkup(), showdownHighlight],
    });

    const strRequestBody = pathJSON.requestBody
      ? JSON.stringify(pathJSON.requestBody, (key, value) => {
          if (key === "description" && typeof value === "string") {
            return converter.makeHtml(value);
          } else {
            return value;
          }
        })
      : "";

    const strResponses = pathJSON.responses
      ? JSON.stringify(pathJSON.responses, (key, value) => {
          if (key === "description" && typeof value === "string") {
            return converter.makeHtml(value);
          } else {
            return value;
          }
        })
      : "";

    const strParameters = pathJSON.parameters
      ? JSON.stringify(pathJSON.parameters)
      : "";

    body = {
      title: api["x-proxy-name"]
        ? api["x-proxy-name"]
        : api.tags
        ? api.tags[0]
        : api.summary,
      titleKW: api["x-proxy-name"]
        ? api["x-proxy-name"]
        : api.tags
        ? api.tags[0]
        : api.summary,
      summary: api.summary,
      path,
      description: api.description ? api.description : "",
      tags: api.tags,
      requestType: reqType,
      requestBody: strRequestBody,
      xGroupName: api["x-group-name"] ? api["x-group-name"] : "",
      xProxyName: api["x-proxy-name"] ? api["x-proxy-name"] : "",
      xDisableDefaultExample: api["x-disable-default-example"]
        ? api["x-disable-default-example"]
        : false,
      responses: strResponses,
      parameters: strParameters,
      servers: yamlData.servers,
      version: version,
      xLinks: api["x-links"] ? api["x-links"] : {},
      childProductName: Array.isArray(api["x-child-product-name"])
        ? api["x-child-product-name"]
        : [api["x-child-product-name"]],
      xDefaultExample: api["x-default-example"] ? api["x-default-example"] : "",
      xCore: api["x-core"] ? api["x-core"] : "",
      xDefaultCore: api["x-core-default"] ? api["x-core-default"] : "",
      xUseCases: api["x-use-cases"] ? api["x-use-cases"] : [],
    };
  } catch (e) {
    errorMessage(YAML_VALIDATOR, `File :${fileName} with ${e?.message}`);
    return false;
  }

  let xFieldsCheck = true;
  if (body.xProxyName.length > 0 && /^\W/.test(body.xProxyName)) {
    errorMessage(
      YAML_VALIDATOR,
      `File :${fileName} API-Path:${path} Error: Invalid character at start of 'x-proxy-name' - ${body.xProxyName}`
    );
    xFieldsCheck = false;
  }
  if (body.xGroupName.length > 0 && /^\W/.test(body.xGroupName)) {
    errorMessage(
      YAML_VALIDATOR,
      `File :${fileName} API-Path:${path} Error: Invalid character at start of 'x-group-name' - ${body.xGroupName}`
    );
    xFieldsCheck = false;
  }

  const apiIndexKey = `${body.path}_${body.requestType}_${version}_${body.xCore}`;
  if (checkedApis[apiIndexKey]) {
    errorMessage(
      YAML_VALIDATOR,
      `File: ${fileName} API: ${path} - Duplicate API detected in ${checkedApis[apiIndexKey]}`
    );
    xFieldsCheck = false;
  } else {
    checkedApis[apiIndexKey] = fileName;
  }

  return xFieldsCheck;
};

const hasAPIs = async (dir) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const file of files) {
    if (file?.name === "tenant.json") {
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, "utf8");
        const tenantData = JSON.parse(content);
        if (tenantData?.apiVersions && tenantData?.apiVersions.length > 0) {
          return tenantData?.apiVersions;
        }
      } catch (e) {
        errorMessage(YAML_VALIDATOR, e?.message);
      }
    }
  }
  return;
};

const main = async () => {
  try {
    if (args?.length > 0) {
      // Check for API version in tenant configuration file
      const apiList = await hasAPIs(folder + "/config");
      if (apiList) {
        const refFolder = provideReferenceFolder(folder);
        await validateDir(refFolder, apiList);
      } else {
        printMessage("SKIPPED");
      }
    } else {
      errorMessage(YAML_VALIDATOR, "No Path for reference directory defined.");
    }
  } catch (e) {
    errorMessage(YAML_VALIDATOR, e?.message);
  }
};

if (require.main === module) {
  main();
}
