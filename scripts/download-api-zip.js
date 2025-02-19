#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");
const AdmZip = require("adm-zip");
const postmanConverter = require("openapi-to-postmanv2");
const args = process.argv.slice(2);
const folder = args?.[0];
const {
  errorMessage,
  warningMsg,
  printMessage,
  provideReferenceFolder,
} = require("./utils/tools");
const postman_zip = new AdmZip(),
  spec_zip = new AdmZip();
const specZipFile = args[0]?.includes("/")
  ? args[0].split("/").pop() + "_spec"
  : "tenant_spec";
const postmanZipFile = args[0]?.includes("/")
  ? args[0].split("/").pop() + "_postman"
  : "tenant_postman";
const Zip_Generator = "ZIP GENERATOR";

const validateDir = async (dir) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  let check = true;

  for (const file of files) {
    if (file.isDirectory()) {
      await validateDir(`${dir}/${file.name}`);
    } else {
      if (file.name === "tenant.json") {
        try {
          const fileName = `${dir}/${file.name}`;
          const content = await fs.promises.readFile(fileName, {
            encoding: "UTF8",
          });
          const data = JSON.parse(content);
          check = await validateSpecExistence(args?.[0], data);
        } catch (e) {
          errorMessage(Zip_Generator, e?.message);
          check = false;
        }
        if (check) {
          printMessage(`${Zip_Generator} : PASSED`);
        } else {
          errorMessage(Zip_Generator, "FAILED");
        }
      }
    }
  }
  return check;
};

const validateSpecExistence = async (dir, tenantData) => {
  let specExistence = true;
  if (tenantData?.apiVersions && tenantData?.apiVersions.length > 0) {
    for (const item of tenantData.apiVersions) {
      const version = item?.version;
      const apiSpecFiles = item.apiSpecFileNames;
      if (apiSpecFiles.length > 0) {
        for (const filePath of apiSpecFiles) {
          const file = `${provideReferenceFolder(
            dir
          )}/${version}/${filePath}.yaml`;
          if (!fs.existsSync(file)) {
            warningMsg(`${file} - Missing`);
            specExistence = false;
          } else {
            try {
              const content = await fs.promises.readFile(file, "utf8");
              const apiJson = yaml.load(content);
              if (!apiJson.paths || !Object.keys(apiJson.paths).length) {
                errorMessage(Zip_Generator, "No path provided!");
                continue;
              }
              const parsedData = await SwaggerParser.validate(apiJson);

              if (parsedData) {
                let check = false;
                for (const [path, obj] of Object.entries(apiJson.paths)) {
                  for (const [reqType, api] of Object.entries(obj)) {
                    if (typeof api !== "object" || api === null) {
                      continue;
                    }
                    if (api["x-proxy-name"]) {
                      check = true;
                      api['summary'] = api["x-proxy-name"];
                    } else {
                      if (!api.hasOwnProperty("x-proxy-name")) {
                        errorMessage(
                          Zip_Generator,
                          `${fileName} - Missing 'x-proxy-name'`
                        );
                      }
                      check = false;
                      break;
                    }
                  }
                  if (!check) {
                    break;
                  }
                }
                if (check) {
                  const tenant_repo = getTenantRepoName(file);

                  const splitPath = file.split("/");
                  const fileName = splitPath[splitPath.length - 1];
                  if (fileName !== null) {
                    tenant_repo.path = tenant_repo?.path.replace(
                      `/${fileName}`,
                      ""
                    );
                  }
                  if (
                    tenant_repo && fileName && content &&
                    await generateSpecZipCollection(
                      tenant_repo,
                      fileName,
                      content
                    )
                  ) {
                    printMessage(`Spec File : ${fileName} added to Zip`);
                  }

                  const postmanFileName = fileName.includes(".yaml")
                    ? fileName.split(".yaml")[0].concat(".json")
                    : `${fileName}.json`;

                  if (
                    tenant_repo && postmanFileName && content &&
                    generatePostmanCollections(
                      tenant_repo,
                      postmanFileName,
                      yaml.dump(apiJson)
                  )) {
                    printMessage(
                      `Postman Collection: ${fileName} added to Zip`
                    );
                  } else {
                    warningMsg(
                      `Unable to create postman Collection for file: ${fileName}`
                    );
                  }
                }
              }
            } catch (e) {
              warningMsg(`${Zip_Generator} - ${e?.message}`);
            }
          }
        }
      }
    }
  }
  return specExistence;
};

const getTenantRepoName = (str) => {
  const data = {};
  const parts = str.split(
    str.includes("references") ? "/references" : "/reference"
  );
  if (parts.length > 1) {
    const arr = parts[0].split("/");
    const name = arr[arr.length - 1];
    const filePath = parts[1];
    data.repo = name;
    data.path = filePath;
    return data;
  }
  return null;
};

const generateSpecZipCollection = async (folder, filename, content) => {
  try {
    if (folder === "../reference") {
      spec_zip.addFile(
        filename,
        Buffer.from(content, "utf8"),
        "Adding folders"
      );
    } else {
      spec_zip.addFile(
        `${folder?.repo}/${folder?.path}/${filename}`,
        Buffer.from(content, "utf8"),
        "Adding file"
      );
    }
    spec_zip.writeZip(`${args}/assets/${specZipFile}.zip`);
  } catch (e) {
    errorMessage("SPEC ZIP GENERATOR", e.message);
    return false;
  }
  return true;
};

const generatePostmanCollections = (folder, postmanFileName, content) => {
  try {
    const timeout = setTimeout(() => {
      console.log("Postman conversion timed out");
      return false;
    }, 5000);

    postmanConverter.convert(
      { type: "string", data: content },
      {},
      (err, conversionResult) => {
        clearTimeout(timeout);
        if (err !== null) {
          errorMessage("Postman GENERATOR - Could not convert spec file", err);
        }
        if (conversionResult.result) {
          printMessage(
            `Adding file postman ----- ${folder?.repo}${folder?.path}/${postmanFileName}`
          );
          if (folder === "../reference") {
            postman_zip.addFile(
              `${postmanFileName}`,
              JSON.stringify(conversionResult?.output[0]?.data)
            );
          } else {
            postman_zip.addFile(
              `${folder?.repo}${folder?.path}/${postmanFileName}`,
              JSON.stringify(conversionResult?.output[0]?.data)
            );
          }
          postman_zip.writeZip(`${args}/assets/${postmanZipFile}.zip`);
          return true
        }
      }
    );
  } catch (error) {
    errorMessage("Postman GENERATOR", error);
  }
  return false;
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${args}`);
    if (args?.length > 0) {
      await validateDir(folder + "/config");
    } else {
      errorMessage(Zip_Generator, "No Path for reference dir. defined");
    }
  } catch (e) {
    errorMessage(Zip_Generator, e.message);
  }
};

if (require.main === module) {
  main();
}
