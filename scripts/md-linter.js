const markdownlint = require("markdownlint");
const showdown = require("showdown");
const fs = require("fs");
const args = process.argv.slice(2);
const folder = args?.[0] + "/docs";
const { errorMessage, errorMsg, printMessage } = require("./utils/tools");

const markdownlinter = async (dir) => {
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files.forEach(async (file) => {
      if (file?.isDirectory()) {
        markdownlinter(`${dir}/${file.name}`);
        return;
      }
      if (/\.md$/.test(file?.name)) {
        try {
          let fileName = `${dir}/${file.name}`;
          const options = {
            files: [fileName],
            config: {
              default: true,
              "no-hard-tabs": false,
              whitespace: false,
              line_length: false,
              "no-duplicate-heading": false,
              "first-line-heading": false,
              "heading-style": false
            },
          };
          markdownlint(options, function callback(err, result) {
            if (!err) {
              if (result.toString().length > 0) {
                errorMessage(
                  "MD LINTER",
                  `PLEASE CHECK FOLLOWING LINTER ISSUES WITHIN THE FILE : ${fileName.split('/docs/')[1]}`
                );
                errorMsg(result);
              } else {
                printMessage(`${fileName.split('/docs/')[1]} - LINTER PASSED`);
              }
            }
          });
        } catch (e) {
          errorMessage("MD LINTER", e.message);
        }
      } else {
        errorMessage(
          "MD LINTER",
          `${`${dir}/${file.name}`.split('/docs/')[1]} has an invalid format or file extension`
        );
      }
    });
  });
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${args}`);
    if (args?.length > 0) {
      await markdownlinter(folder);
    } else {
      errorMessage("MD VALIDATOR", "No Path for docs dir. defined");
    }
  } catch (e) {
    errorMessage("MD VALIDATOR", e.message);
  }
};

if (require.main === module) {
  main();
}