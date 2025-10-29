#!/usr/bin/env node

const showdown = require("showdown");
const fs = require("fs");
const args = process.argv.slice(2);
const docsFolder = args?.[0] + "/docs";
const recipesFolder = args?.[0] + "/recipes";
const {
  enrichHTMLFromMarkup,
  showdownHighlight,
  mdExtension,
} = require("./utils/md-utils");
const { errorMessage, errorMsg, printMessage } = require("./utils/tools");
let urlsArr = [];

const converter = new showdown.Converter({
  ghCompatibleHeaderId: true,
  emoji: true,
  disableForced4SpacesIndentedSublists: true,
  literalMidWordUnderscores: true,
  tables: true,
  extensions: [enrichHTMLFromMarkup(), showdownHighlight, mdExtension],
});

converter.addExtension(() => {
  return [
    {
      type: "output",
      regex: /<a[^>]*?href="([^"]+)"[^>]*?>/g,
      replace: function (text, url) {
        if (url.startsWith("http:") || url.startsWith("https:")) {
          urlsArr.push(url);
          return '<a href="' + url + '" target="_blank">';
        }
        return text;
      },
    },
  ];
}, "externalLink");

converter.addExtension(() => {
  return [
    {
      type: "output",
      filter: function (htmlContent) {
        const imgRegex = /<img.*?src=["'](.*?)["']/g;
        let match;
        while ((match = imgRegex.exec(htmlContent)) !== null) {
          urlsArr.push(match[1]);
        }
        return htmlContent;
      },
    },
  ];
}, "extractImageUrls");

const mdHtmlValidator = async (dir) => {
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files?.forEach(async (file) => {
      if (file?.isDirectory()) {
        check = mdHtmlValidator(`${dir}/${file.name}`);
        return;
      }
      if (/\.mdx?$/.test(file?.name)) {
        try {
          let check = true;
          let fileName = `${dir}/${file.name}`;
          const content = fs.readFileSync(fileName, "utf8");
          converter.makeHtml(content);

          urlsArr.forEach((url) => {
            if (
              /raw\.githubusercontent|github\.com\/Fiserv.*(\/raw\/|\/files\/)/.test(
                url
              )
            ) {
              if (/\.(png|jpg|jpeg|gif|tiff)$/.test(url))
                errorMsg(
                  `> ${url} is a raw github image link. Please utilize '/assets/images' instead.`
                );
              else
                errorMsg(
                  `> ${url} is a github fetch link. Please utilize '/assets' instead for file uploads.`
                );
              check = false;
              return;
            } else if (
              /localhost:8080\/api\/(hosted-image|download)\//g.test(url)
            ) {
              if (
                !fs.existsSync(
                  `${args[0]}/${decodeURIComponent(
                    url.substring(url.indexOf("assets/"))
                  )}`
                )
              ) {
                errorMsg(
                  `${decodeURIComponent(
                    url.substring(url.indexOf("assets/"))
                  )} - Missing from assets/ (file must be in assets folder or subfolder)`
                );
                check = false;
              }
            }
          });
          urlsArr = [];

          if (/(\<br\s*\>)/gi.test(content) || /<([^!/>]+)>/g.test(content)) {
            check = false;
            const lines = content.split("\n");
            // Find all opening tags that are not self-closing and do not have a closing tag
            const openTags = [];
            lines.forEach((line, idx) => {
              const brMatch = line.match(/(\<br\s*\>)/gi);
              if (brMatch) {
                openTags.push({
                  tag: `Line ${idx + 1}: ${brMatch.length} improper <br> tag${
                    brMatch.length > 1 ? "s" : ""
                  }, should be <br />`,
                });
              }

              const tagRegex = /<([A-Za-z0-9]+)[^!/>]*>/g;
              let match;
              while ((match = tagRegex.exec(line)) !== null) {
                if (match[1].toLowerCase() === "br") continue;
                const before = line.slice(0, match.index);
                const after = line.slice(match.index + match[0].length);
                const hasSingleQuotes =
                  before.includes("'") && after.includes("'");
                const hasDoubleQuotes =
                  before.includes('"') && after.includes('"');
                const hasBackticks =
                  before.includes("`") && after.includes("`");
                if (!(hasSingleQuotes || hasDoubleQuotes || hasBackticks)) {
                  openTags.push({ tag: match[1], line: idx + 1 });
                }
              }
            });

            // Check for missing closing tags
            openTags.forEach(({ tag, line }) => {
              const closeTagRegex = new RegExp(`<\\/${tag}>`, "i");
              // const selfCloseTagRegex = new RegExp(`<${tag}[^>]*\\/?>`, "i");
              if (!line) {
                errorMsg(tag);
                return;
              }
              if (!closeTagRegex.test(content)) {
                errorMsg(
                  `Line ${line}: Unclosed <${tag}> tag. Should be \\<${tag}> or have accompanying </${tag}>`
                );
              }
            });
          }

          if (check) {
            const relativePath = dir.slice(
              dir.indexOf("docs") !== -1
                ? dir.indexOf("docs")
                : dir.indexOf("recipes")
            );
            printMessage(
              `${relativePath}/${fileName
                .split("/")
                .pop()} - HTML VALIDATOR PASSED`
            );
          } else {
            errorMessage(
              "HTML VALIDATOR",
              `PLEASE FIX LINK RELATED ISSUES WITHIN THE FILE : ${
                fileName.split("/docs/")[1]
              }`
            );
          }
        } catch (e) {
          errorMessage("HTML VALIDATOR", e.message);
          urlsArr = [];
        }
      } else if (file?.name === "config.yaml") {
        return;
      } else {
        errorMessage(
          "HTML VALIDATOR",
          `${
            `${dir}/${file?.name}`.split("/docs/")[1]
          } is an invalid subdir/markdown file`
        );
        urlsArr = [];
      }
    });
  });
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${args}`);
    if (args?.length > 0) {
      mdHtmlValidator(docsFolder);
      mdHtmlValidator(recipesFolder);
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
