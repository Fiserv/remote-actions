#!/usr/bin/env node

const fs = require("fs");
const { errorMessage, printMessage } = require("./utils/tools");

const args = process.argv.slice(2);
const folder = args?.[0] + "/docs";
const release_notes_validator = "RELEASE NOTES VALIDATOR";

const findReleaseNotes = async (dir) => {
  fs.readdir(dir, { withFileTypes: true }, async (err, files) => {
    try {
      for (const file of files) {
        if (file?.isDirectory() && /release.*note/i.test(file?.name)) {
          const check = await validateNonEmptyDir(`${dir}/${file.name}`);
          if (check) {
            printMessage(`${release_notes_validator} : PASSED`);
          } else {
            errorMessage(release_notes_validator, "Release notes directory does not contain any markdown documents");
          }
          return;
        }
      }
    } catch (e) {
      errorMessage(release_notes_validator, e?.message);
    }

    errorMessage(release_notes_validator, "Release notes directory not found");
  });
};

const validateNonEmptyDir = async (dir) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  if (!files?.length)
    return false;

  if (files.find(f => /.md$/.test(f.name)))
    return true;

  for (const file of files) {
    if (file?.isDirectory()) {
      const subDirCheck = await validateNonEmptyDir(`${dir}/${file.name}`);
      if (subDirCheck)
        return true;
    }
  }

  return false;
}

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${folder}`);
    printMessage(args);

    if (args?.length > 0) {
      findReleaseNotes(folder);
    } else {
      errorMessage(
        "Release Notes VALIDATOR",
        "No path for reference dir. defined"
      );
    }
  } catch (e) {
    errorMessage("Release Notes VALIDATOR", e.message);
  }
};

if (require.main === module) {
  main();
}
