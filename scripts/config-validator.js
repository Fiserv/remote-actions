#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const fetch = require('node-fetch');

const github_token = process.env.API_TOKEN_GITHUB;
const args = process.argv.slice(2);
const folder = args?.[0] + "/config";
const fiserv_resources = args?.[1] || "false";
const {
  errorMessage,
  errorMsg,
  exceptionMsg,
  printMessage,
  provideReferenceFolder,
} = require("./utils/tools");
const ded_validator = "DED VALIDATOR";
const pdl_validator = "Product Layout VALIDATOR";
const tenant_config_validator = "TENANT CONFIG VALIDATOR";
const file_check = [false, false, false];
const description_length = 112;
const explorerDefinitionRegex = /^(document|recipe)-explorer-definition\.yaml$/;

const validateDir = async (dir, fiserv_resources) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    let check = true;
    let validatorName = "";

    if (explorerDefinitionRegex.test(file?.name)) {
      file_check[0] = true;
      try {
        const fileName = `${dir}/${file.name}`;
        validatorName = file.name.slice(0, file.name.lastIndexOf('.'));
        const content = await fs.promises.readFile(fileName, "utf8");
        const apiJson = yaml.load(content);
        check = await validateDocLinks(args?.[0], apiJson);
      } catch (e) {
        errorMessage(validatorName.toUpperCase(), e?.message);
        check = false;
      }
      if (check) {
        printMessage(`${validatorName.toUpperCase()} : PASSED`);
      } else {
        errorMessage(validatorName.toUpperCase());
      }
    }

    if (file?.name === "product-layout.yaml") {
      file_check[1] = true;
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, "utf8");
        yaml.load(content);
      } catch (e) {
        errorMessage(pdl_validator, e?.message);
        check = false;
      }
      if (check) {
        printMessage(`${pdl_validator} : PASSED`);
      } else {
        errorMessage(pdl_validator);
      }
    }

    if (file?.name === "tenant.json") {
      file_check[2] = true;
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, "utf8");
        const data = JSON.parse(content);
        const valid_solutions = fiserv_resources === "true"
          ? ["fiserv-resources"]
          : ["merchants", "financial-institutions", "fintech", "carat"];
        const productUrls = ['layout', 'documentation', 'documenttree', 'documenttreeV2'];

        check = validateSpecExistence(args?.[0], data);
        if (data?.name !== "Support") {
          if (!data?.solution?.length) {
            errorMsg(
              `File ${file?.name} missing the solution field! Please add valid solution(s) into the array in ${file?.name} file`
            );
            check = false;
          } else {
            const invalid_solutions = data?.solution.filter((x) => !valid_solutions.includes(x))
              if ( invalid_solutions.length ) {
              errorMsg(
                `File ${ file?.name } has invalid solutions [${invalid_solutions}] in the array! Please fix the solution array in ${ file?.name } file`
              );
              check = false;
            }
          }
        }

       for (const p of productUrls) {
          if (!data.product[p]?.includes(data.name)) {
            errorMsg(
              `Field "product.${p}" should be set to product name`
            );
            check = false;
          }
        };

        if (!data?.getStartedFilePath) {
          errorMsg(
            `File ${file?.name} missing Getting Started link! Please add .md file path with property name "getStartedFilePath" in ${file?.name} file`
          );
          check = false;
        } else {
          const file = `${args?.[0]}/${
            data.getStartedFilePath.charAt(0) === "/"
              ? data.getStartedFilePath.substring(1)
              : data.getStartedFilePath
          }`;
          if (!fs.existsSync(file)) {
            errorMsg(
              `${data?.getStartedFilePath} doesn't exist in docs directory`
            );
            check = false;
          }
        }

        if (data?.resourcesFilePath) {
          const file = `${args?.[0]}/${
            data.resourcesFilePath.charAt(0) === "/"
              ? data.resourcesFilePath.substring(1)
              : data.resourcesFilePath
          }`;
          if (!fs.existsSync(file)) {
            errorMsg(
              `${data?.resourcesFilePath} doesn't exist in docs directory`
            );
            check = false;
          }
        }

        if (!data?.product.description) {
          errorMsg(
            `Tenant description is missing`
          );
          check = false;
        } else if (data?.product.description?.length == 0 || data?.product.description?.length > description_length) {
          errorMsg(
            `Product description must be between 1 and ${description_length} characters.`
          );
          check = false;
        }
      } catch (e) {
        errorMessage(tenant_config_validator, e?.message);
        check = false;
      }

      if (check) {
        printMessage(`${tenant_config_validator} : PASSED`);
      } else {
        errorMessage(tenant_config_validator);
      }
    }
  }
};

const validateDocLinks = async (dir, arr) => {
  let check = true;
  try {
    for (const obj of arr) {
      if (obj?.link?.length) {
        const file = `${dir}/${obj.link.replace(/\#[\w-]+/, '')}`;
        console.log(file);
        if (obj.link.includes("branch")) {
          const repo = dir.match(/[^/]+$/)?.[0];
          const branch = obj.link.match(/branch=(.+)&?/)?.[1];
          obj.link = obj.link.split(/&?branch/)[0];
          const response = await fetch(`https://api.github.com/repos/Fiserv/${repo}/contents/${obj.link}?ref=${branch}`,
              {
                headers: {
                    Authorization: 'Bearer ' + github_token
                }
            });
            if (response.status === 404) {
              errorMsg(`${repo}/contents/${obj.link}?ref=${branch} - Missing`);
              check = false;
            } else if (!response.ok) {
              throw new Error(`Request failed ${response.status}: ${response.url} - ${response.statusText}`);
            }
        }
        else if (!fs.existsSync(file)) {
          errorMsg(`${file} - Missing`);
          check = false;
        }
      }
      if (obj?.sections) {
        check = await validateDocLinks(dir, obj?.sections) && check;
      }
    };
  } catch (e) {
    check = false;
  }
  return check;
};

const validateSpecExistence = (dir, tenantData) => {
  let specExistence = true;
  let MajorVersionCheck = 0,
    MajorVersion = 0;
  let versions = [];

  if (tenantData?.apiVersions && tenantData?.apiVersions.length > 0) {
    for (const item of tenantData.apiVersions) {
      const version = item?.version;
      const versionType = item?.versionType;
      versions.push(version);
      if (versionType === "major") {
        MajorVersionCheck++;
        MajorVersion = version;
      }

      if (!item.releaseNotesPath?.length || !item.releaseNotesPath.endsWith('.md')) {
        errorMsg(`${version} missing proper release notes`);
        specExistence = false;
      }

      const apiSpecFiles = item.apiSpecFileNames;
      if (apiSpecFiles.length > 0) {
        for (const filePath of apiSpecFiles) {
          const file = `${provideReferenceFolder(
            dir
          )}/${version}/${filePath}.yaml`;
          if (!fs.existsSync(file)) {
            errorMsg(`${file} - Missing`);
            specExistence = false;
          }
        }
      }
    }
    // Checking only one Major version is published in tenant config file
    if (MajorVersionCheck > 1) {
      errorMsg(`Multiple Major Versions found in TenantConfig file`);
      specExistence = false;
    } else {
      // Checking Major version is the highest version available amoung all versions.
      const sortedVersions = sortVersionsDescending(versions);
      if (sortedVersions.length > 0) {
        if (sortedVersions[0] != MajorVersion) {
          errorMsg(`Incorrect API major version assignment : ${MajorVersion}.
  Please use correct versioning pattern (use Major, Minor and Patch) suggested Major version: ${sortedVersions[0]}`);
          specExistence = false;
        }
      }
    }
  }
  return specExistence;
};

const sortVersionsDescending = (versions) => {
  return versions.sort((a, b) => {
    const aParts = a.split(".");
    const bParts = b.split(".");
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      let a = parseInt(aParts[i] || "0");
      let b = parseInt(bParts[i] || "0");

      if (a !== b) {
        return b - a;
      }
    }
    return 0;
  });
};

const main = async () => {
  try {
    printMessage(`Executing validateDir(${folder}, ${fiserv_resources})`);

    if (args?.length > 0) {
      await validateDir(folder, fiserv_resources);
    } else {
      errorMessage(
        "Tenant Config VALIDATOR",
        "No path for reference dir. defined"
      );
    }
  } catch (e) {
    errorMessage("Tenant Config VALIDATOR", e.message);
  }

  if (file_check.includes(false)) {
    file_check.forEach((check, index) => {
      if (!check) {
        switch (index) {
          case 0:
            exceptionMsg(ded_validator, "MISSING");
            break;
          case 1:
            exceptionMsg(pdl_validator, "MISSING");
            break;
          case 2:
            exceptionMsg(tenant_config_validator, "MISSING");
            break;
        }
      }
    });
    errorMessage(
      "Tenant Config VALIDATOR",
      "Some files are missing in the tenant config folder. Please check the folder structure."
    );
  }
};

if (require.main === module) {
  main();
}
