#!/usr/bin/env node

const fs = require("fs");
const yaml = require("js-yaml");
const args = process.argv.slice(2);
const folder = args?.[0] + "/config";
const { errorMessage, errorMsg, printMessage } = require("./utils/tools");
let fileAccessFileExistence = true;
const file_access_validator = "FILE ACCESS VALIDATOR";
const access_levels = ["public", "private"];
const supported_file_types = [
  "doc",
  "docx",
  "gz",
  "md",
  "msi",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "txt",
  "xls",
  "xlsx",
  "zip",
];

const validateDir = async (dir) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    if (file?.name === "files-access-definiton.yaml") {
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, "utf8");
        const fileAccessJson = yaml.load(content);
        return validateFiles(`${args?.[0]}/assets/files`, fileAccessJson);
      } catch (e) {
        errorMessage(file_access_validator, e?.message);
        return false;
      }
    }
  }

  fileAccessFileExistence = false;
  return true;
};

const validateFiles = (dir, arr) => {
  let validFileAccessDefinition = true;
  try {
    arr.forEach((obj) => {
      const file = `${dir}/${obj?.filePath}`;
      if (obj?.filePath) {
        if (!fs.existsSync(file)) {
          errorMsg(`${file} - Missing from assets/files/`);
          validFileAccessDefinition = false;
        }
        if (!supported_file_types.find((f) => file.endsWith(f))) {
          errorMsg(
              `${file} - Using unsupported file type ${file.substring(
                  file.lastIndexOf(".")
              )}`
          );
          validFileAccessDefinition = false;
        }
        if (file.includes(' ')) {
          errorMsg(
            `${file} - Contains space in name`
          );
          validFileAccessDefinition = false;
        }
      }
      if (obj?.access) {
        if (!access_levels.find((x) => x === obj.access)) {
          errorMsg(`${file} - Invalid access level`);
          validFileAccessDefinition = false;
        }
      } else {
        errorMsg(`${file} - Missing access level`);
        validFileAccessDefinition = false;
      }
      if (obj?.groups) {
        const improperGroupNames = obj?.groups.filter((x) => x.match(/\W/));
        if (improperGroupNames?.length) {
          errorMsg(
            `${file} - Contains improper group names: ${improperGroupNames}`
          );
          validFileAccessDefinition = false;
        }
      }
    });
  } catch (e) {
    errorMessage(file_access_validator, e?.message);
  }
  return validFileAccessDefinition;
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${folder}`);
    if (args?.length > 0) {
      const check = await validateDir(folder);
      if (check) {
        if (fileAccessFileExistence) {
          printMessage(`${file_access_validator} : PASSED`);
        } else {
          printMessage("No files-access-definition.yaml found: SKIPPED");
        }
      } else {
        errorMessage(file_access_validator);
      }
    } else {
      errorMessage(file_access_validator, "No Path for reference dir. defined");
    }
  } catch (e) {
    errorMessage(file_access_validator, e.message);
  }
};

if (require.main === module) {
  main();
}
