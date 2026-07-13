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
const { compile } = require('@mdx-js/mdx');
const { preprocessMdxToMarkdown } = require("./utils/mdx-utils");

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

const validateCodeFenceStructure = (content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);
  let activeFence = null;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(```|~~~)([^`]*)$/);
    if (!fenceMatch) {
      return;
    }

    const marker = fenceMatch[1];
    const suffix = (fenceMatch[2] || "").trim();
    const lineNumber = index + 1;

    if (!activeFence) {
      activeFence = { marker, lineNumber };
      return;
    }

    if (marker === activeFence.marker && suffix.length === 0) {
      activeFence = null;
      return;
    }

    issues.push(
      `Line ${lineNumber}: nested or duplicate opening code fence '${line.trim()}' found before closing fence opened at line ${activeFence.lineNumber}.`
    );
  });

  if (activeFence) {
    issues.push(
      `Line ${activeFence.lineNumber}: code fence '${activeFence.marker}' is not closed.`
    );
  }

  return issues;
};

const validateBracePlaceholders = (content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Track fenced code blocks (same logic as validateCodeFenceStructure)
    const fenceMatch = line.match(/^\s*(```|~~~)([^`]*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const suffix = (fenceMatch[2] || '').trim();
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        return;
      } else if (marker === fenceMarker && suffix.length === 0) {
        inFence = false;
        fenceMarker = null;
        return;
      }
    }

    if (inFence) return;

    // Strip inline code spans to avoid false positives inside backticks
    const stripped = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));

    // Match bare {identifier} or {identifier_name} patterns
    const placeholderRegex = /(?<!\\)\{[a-z_][a-z0-9_]*\}/gi;
    let match;
    while ((match = placeholderRegex.exec(stripped)) !== null) {
      issues.push(
        `Line ${lineNumber}: unescaped placeholder '${match[0]}' found. Use \\${match[0]} or wrap in backticks to escape.`
      );
    }
  });

  return issues;
};

const mdHtmlValidator = async (dir) => {
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files?.forEach(async (file) => {
      if (file?.isDirectory()) {
        mdHtmlValidator(`${dir}/${file.name}`);
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

          const placeholderIssues = validateBracePlaceholders(content);
          if (placeholderIssues.length > 0) {
            check = false;
            placeholderIssues.forEach((issue) => errorMsg(issue));
          }

          try {
            const processedContent = preprocessMdxToMarkdown(content);
            await compile(processedContent, {
              outputFormat: 'function-body',
              development: false,
            });
          } catch (error) {
              check = false;
              errorMsg(`MDX Compilation Error: ${error.message.includes('acorn') ? 'Parsing for embeded JavaScript expressions inside {} failed. Possibly missing escape character \\ for regular string {' : error.message}`);
          }

          const codeFenceIssues = validateCodeFenceStructure(content);
          if (codeFenceIssues.length > 0) {
            check = false;
            codeFenceIssues.forEach((issue) => errorMsg(issue));
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
