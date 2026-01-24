#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const args = process.argv.slice(2);
const folder = args?.[0] + "/config";
const { errorMessage, errorMsg, printMessage } = require("./utils/tools");
let apiAccessFileExistence = true;
const api_access_validator = "API ACCESS VALIDATOR";

/**
 * Validates a section object recursively
 * @param {Object} section - The section object to validate
 * @param {string} path - The path for error reporting
 * @param {number} level - The current level of nesting
 * @returns {boolean} - Whether the section is valid
 */
const validateSection = (section, path, level) => {
  if (!section) {
    errorMsg(`${path} - Section is undefined or null`);
    return false;
  }

  let isValid = true;
  // A section must have either xChildProductName, xGroupName, or xProxyName
  if (
    !section.xChildProductName?.length &&
    !section.xGroupName?.length &&
    !section.xProxyName?.length
  ) {
    errorMsg(`${path} - Section must list the level being locked`);
    isValid = false;
  }

  // Validate xChildProductName if present
  if (section.xChildProductName) {
    if (
      typeof section.xChildProductName !== "string" ||
      !section.xChildProductName.trim().length
    ) {
      errorMsg(`${path}: 'xChildProductName' must be a non-empty string`);
      isValid = false;
    }
    if (level !== 0) {
      errorMsg(
        `${path}: 'xChildProductName' can only be used at the top level`,
      );
      isValid = false;
    }
  }

  // Validate xGroupName if present
  if (section.xGroupName) {
    if (
      typeof section.xGroupName !== "string" ||
      !section.xGroupName.trim().length
    ) {
      errorMsg(`${path} - 'xGroupName' must be a non-empty string`);
      isValid = false;
    }
    if (level !== 1) {
      errorMsg(`${path}: 'xGroupName' cannot be defined at this level`);
      isValid = false;
    }
  }

  // Validate xProxyName if present
  if (section.xProxyName) {
    if (
      typeof section.xProxyName !== "string" ||
      !section.xProxyName.trim().length
    ) {
      errorMsg(`${path} - 'xProxyName' must be a non-empty string`);
      isValid = false;
    }
    if (level !== 2) {
      errorMsg(`${path}: 'xProxyName' cannot be defined at this level`);
      isValid = false;
    }
  }

  // Validate nested sections if present
  if (section.sections) {
    if (!Array.isArray(section.sections)) {
      errorMsg(`${path} - 'sections' must be an array`);
      isValid = false;
    } else {
      section.sections.forEach((subsection, index) => {
        const sectionName =
          subsection.xGroupName || subsection.xProxyName || `section[${index}]`;
        isValid =
          validateSection(subsection, `${path} - ${sectionName}`, level + 1) &&
          isValid;
      });
    }
  }

  return isValid;
};

/**
 * Validates a top-level entry in the API access definition
 * @param {Object} entry - The entry to validate
 * @param {number} index - The index of the entry
 * @returns {boolean} - Whether the entry is valid
 */
const validateEntry = (entry, index) => {
  let isValid = true;
  const entryPath = `Entry[${index}]`;

  // if (
  //   !entry.xChildProductName?.length &&
  //   !entry.xGroupName?.length &&
  //   !entry.xProxyName?.length
  // ) {
  //   errorMsg(`${entryPath} - Section must list level to be locked`);
  //   isValid = false;
  // }

  let level = 99;
  let fields = 0;
  // Validate xChildProductName if present
  if (entry.xChildProductName) {
    if (
      typeof entry.xChildProductName !== "string" ||
      !entry.xChildProductName.trim().length
    ) {
      errorMsg(`${entryPath} - 'xChildProductName' must be a non-empty string`);
      isValid = false;
    }
    level = 0;
    fields += 1;
  }

  // Validate xGroupName if present
  if (entry.xGroupName) {
    if (
      typeof entry.xGroupName !== "string" ||
      !entry.xGroupName.trim().length
    ) {
      errorMsg(`${entryPath} - 'xGroupName' must be a non-empty string`);
      isValid = false;
    }
    level = 1;
    fields += 1;
  }

  // Validate xProxyName if present
  if (entry.xProxyName) {
    if (
      typeof entry.xProxyName !== "string" ||
      !entry.xProxyName.trim().length
    ) {
      errorMsg(`${entryPath} - 'xProxyName' must be a non-empty string`);
      isValid = false;
    }
    level = 2;
    fields += 1;
  }

  if (fields === 0) {
    errorMsg(
      `${entryPath} - One of 'xChildProductName', 'xGroupName', or 'xProxyName' must be defined per entry`,
    );
    isValid = false;
  }

  // Ensure only one of xChildProductName, xGroupName, or xProxyName is present
  if (fields > 1) {
    errorMsg(
      `${entryPath} - Only one of 'xChildProductName', 'xGroupName', or 'xProxyName' can be defined per entry`,
    );
    isValid = false;
  }

  // Validate groups
  if (!entry.groups || !Array.isArray(entry.groups)) {
    errorMsg(`${entryPath} - 'groups' must be an array`);
    isValid = false;
  } else {
    entry.groups.forEach((group, idx) => {
      if (typeof group !== "string" || !group.trim()) {
        errorMsg(
          `${entryPath}.groups[${idx}] - Group must be a non-empty string`,
        );
        isValid = false;
      }
      // Check for improper group names (should only contain alphanumeric and underscore)
      if (group.match(/[^A-Za-z0-9_]/)) {
        errorMsg(
          `${entryPath}.groups[${idx}] - Group name '${group}' contains invalid characters (only alphanumeric and underscore allowed)`,
        );
        isValid = false;
      }
    });
  }

  // Validate versions if present
  if (entry.versions) {
    if (!Array.isArray(entry.versions)) {
      errorMsg(`${entryPath} - 'versions' must be an array`);
      isValid = false;
    } else {
      entry.versions.forEach((version, idx) => {
        if (typeof version !== "string" || !version.trim()) {
          errorMsg(
            `${entryPath}.versions[${idx}] - Version must be a non-empty string`,
          );
          isValid = false;
        }
      });
    }
  }

  // Validate sections if present
  if (entry.sections) {
    if (!Array.isArray(entry.sections)) {
      errorMsg(`${entryPath} - 'sections' must be an array`);
      isValid = false;
    } else {
      entry.sections.forEach((section, idx) => {
        const sectionName =
          section.xGroupName || section.xProxyName || `section[${idx}]`;
        isValid =
          validateSection(
            section,
            `${entryPath} - ${sectionName}`,
            level + 1,
          ) && isValid;
      });
    }
  }

  return isValid;
};

/**
 * Validates the entire API access definition structure
 * @param {Array} apiAccessDefinition - The parsed YAML content
 * @returns {boolean} - Whether the definition is valid
 */
const validateApiAccessDefinition = (apiAccessDefinition) => {
  let isValid = true;

  // Check if the root is an array
  if (!Array.isArray(apiAccessDefinition)) {
    errorMsg("Root element must be an array");
    return false;
  }

  // Check if array is empty
  if (apiAccessDefinition.length === 0) {
    errorMsg("API access definition cannot be empty");
    return false;
  }

  // Validate each entry
  apiAccessDefinition.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errorMsg(`Entry[${index}] - Must be an object`);
      isValid = false;
    } else {
      isValid = validateEntry(entry, index) && isValid;
    }
  });

  return isValid;
};

/**
 * Searches for and validates the api-access-definition.yaml file
 * @param {string} dir - The directory to search in
 * @returns {Promise<boolean>} - Whether validation passed
 */
const validateDir = async (dir) => {
  const files = await fs.promises.readdir(dir);

  for (const file of files) {
    if (file === "api-access-definition.yaml") {
      try {
        const fileName = `${dir}/${file}`;
        const content = await fs.promises.readFile(fileName, "utf8");
        const apiAccessJson = yaml.load(content);
        return validateApiAccessDefinition(apiAccessJson);
      } catch (e) {
        errorMessage(api_access_validator, e?.message);
        return false;
      }
    }
  }

  apiAccessFileExistence = false;
  return true;
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${folder}`);
    if (args?.length > 0) {
      const check = await validateDir(folder);
      if (check) {
        if (apiAccessFileExistence) {
          printMessage(`${api_access_validator} : PASSED`);
        } else {
          printMessage("No api-access-definition.yaml found: SKIPPED");
        }
      } else {
        errorMessage(api_access_validator);
      }
    } else {
      errorMessage(api_access_validator, "No Path for reference dir. defined");
    }
  } catch (e) {
    errorMessage(api_access_validator, e.message);
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  validateApiAccessDefinition,
  validateEntry,
  validateSection,
};
