#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const fetch = require("node-fetch");

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
        validatorName = file.name.slice(0, file.name.lastIndexOf("."));
        const content = await fs.promises.readFile(fileName, "utf8");
        const treeJson = yaml.load(content);
        const lines = content.split("\n");

        for (const obj of treeJson) {
          // const sectionCheck = await validateSection(dir.match(/[^/]+$/)?.[0], obj.sections, lines);
          check =
            (await validateSection("remote-actions", obj.sections, lines)) &&
            check;
        }
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

        // Add improper <br> tag checks
        if (
          /(\<br\s*\>)/gi.test(content) ||
          /(\<\\\s?br\s*\>)/gi.test(content)
        ) {
          errorMsg(
            `${fileName} contains improper <br> tags. Use <br /> instead.`
          );
          check = false;
        }
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
        const valid_solutions =
          fiserv_resources === "true"
            ? ["fiserv-resources"]
            : ["merchants", "financial-institutions", "fintech", "carat"];
        const productUrls = [
          "layout",
          "documentation",
          "documenttree",
          "documenttreeV2",
        ];

        check = validateSpecExistence(args?.[0], data);
        if (data?.name !== "Support") {
          if (!data?.solution?.length) {
            errorMsg(
              `File ${file?.name} missing the solution field! Please add valid solution(s) into the array in ${file?.name} file`
            );
            check = false;
          } else {
            const invalid_solutions = data?.solution.filter(
              (x) => !valid_solutions.includes(x)
            );
            if (invalid_solutions.length) {
              errorMsg(
                `File ${file?.name} has invalid solutions [${invalid_solutions}] in the array! Please fix the solution array in ${file?.name} file`
              );
              check = false;
            }
          }
        }

        for (const p of productUrls) {
          if (!data.product[p]?.includes(data.name)) {
            errorMsg(`Field "product.${p}" should be set to product name`);
            check = false;
          }
        }

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
          errorMsg(`Tenant description is missing`);
          check = false;
        } else if (
          data?.product.description?.length == 0 ||
          data?.product.description?.length > description_length
        ) {
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

const findLineNumber = (text, lines) => {
  // First, try to find an exact match
  const exactMatchIndex = lines.findIndex((line) => {
    return line.trim().match(new RegExp(`^link:\\s*['"]?${text}['"]?$`));
  });

  if (exactMatchIndex !== -1) {
    return exactMatchIndex + 1;
  }

  // If no exact match, fall back to partial match (includes)
  const partialMatchIndex = lines.findIndex((line) => line.includes(text));
  return partialMatchIndex !== -1 ? partialMatchIndex + 1 : null;
};

/**
 *
 * @param {string} repo
 * @param {Array} sections
 * @param {Array} lines
 * @returns
 */
const validateSection = async (repo, sections, lines) => {
  let sectionCheck = true;
  for (const section of sections) {
    if (!section.title) {
      if (section.link) {
        errorMsg(
          `Section missing title field on line ${findLineNumber(
            section.link,
            lines
          )}`
        );
      } else {
        errorMsg("Invalid `- sections` object defined");
      }

      sectionCheck = false;
    }
    if (section.link) {
      if (!section.link.match(/\.mdx?/)) {
        errorMsg(`Section link ${section.link} is not a valid .md file`);
        sectionCheck = false;
      } else if (!section.link?.includes("branch")) {
        // Check if the document exists locally in this repo
        if (
          !fs.existsSync(`${args?.[0]}/${section.link.replace(/^\/+/g, "")}`)
        ) {
          errorMsg(
            `Section link ${section.link} (line ${findLineNumber(
              section.link,
              lines
            )}) - Missing from repository`
          );
          sectionCheck = false;
        }
      } else {
        const response = await fetch(
          `https://api.github.com/repos/Fiserv/${repo}/contents/${section.link.replace(
            "branch",
            "ref"
          )}`,
          {
            headers: {
              Authorization: "Bearer " + github_token,
            },
          }
        );
        if (response.status === 404) {
          errorMsg(
            `Section link ${section.link} (line ${findLineNumber(
              section.link,
              lines
            )}) - Missing from repository Github repository`
          );
          sectionCheck = false;
        } else if (!response.ok) {
          throw new Error(
            `Request failed ${response.status}: ${response.url} - ${response.statusText}`
          );
        }
      }
    }

    // Check sub-sections recursively
    if (section.sections?.length > 0) {
      sectionCheck =
        (await validateSection(repo, section.sections, lines)) && sectionCheck;
    }
  }
  return sectionCheck;
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

      if (
        !item.releaseNotesPath?.length ||
        !item.releaseNotesPath.endsWith(".md")
      ) {
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
