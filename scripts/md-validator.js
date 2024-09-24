#!/usr/bin/env node

const showdown = require("showdown");
const fs = require("fs");
const args = process.argv.slice(2);
const folder = args?.[0] + "/docs";
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
      regex: /<a\shref[^>]+>/g,
      replace: function (text) {
        const url = text.match(/"(.*?)"/)[1];
        if (url.startsWith("http:") || url.startsWith("https:")) {
          urlsArr.push(url);
          return '<a href="' + url + '" target="_blank">';
        }
        return text;
      },
    }
  ];
}, "externalLink");

converter.addExtension(() => {
  return [
  {
    type: 'output',
    filter: function (htmlContent) {
        const imgRegex = /<img.*?src=["'](.*?)["']/g;
        let match;
        while ((match = imgRegex.exec(htmlContent)) !== null) {
          urlsArr.push(match[1]);
        }
        return htmlContent;
    }
  }
  ]
}, "extractImageUrls");

const mdHtmlValidator = async (dir) => {
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files?.forEach(async (file) => {
      if (file?.isDirectory()) {
        check = mdHtmlValidator(`${dir}/${file.name}`);
        return;
      }
      if (/\.md$/.test(file?.name)) {
        try {
          let check = true;
          let fileName = `${dir}/${file.name}`;
          const content = fs.readFileSync(fileName, "utf8");
          converter.makeHtml(content);

          urlsArr.forEach(url => {
            if (/raw\.githubusercontent|github\.com\/Fiserv.*(\/raw\/|\/files\/)/.test(url)) {
              if (/\.(png|jpg|jpeg|gif|tiff)$/.test(url))
                errorMsg(`> ${url} is a raw github image link. Please utilize '/assets/images' instead.`);
              else
                errorMsg(`> ${url} is a github fetch link. Please utilize '/assets' instead for file uploads.`);
              check = false;
              return;
            } else if (/localhost:8080\/api\/(hosted-image|download)\//g.test(url)) {
              if (!fs.existsSync(`${args[0]}/${url.substring(url.indexOf("assets/"))}`)) {
                errorMsg(`${url.substring(url.indexOf("assets/"))} - Missing from assets/`);
                check = false;
              }
            }
          });
          urlsArr = [];

          if (check) {
            printMessage(`${fileName.split('/docs/')[1]} - HTML VALIDATOR PASSED`);
          } else {
            errorMessage('HTML VALIDATOR', `PLEASE FIX LINK RELATED ISSUES WITHIN THE FILE : ${fileName.split('/docs/')[1]}`);
          }
        } catch (e) {
          errorMessage("HTML VALIDATOR", e.message);
          urlsArr = [];
        }
      } else {
        errorMessage("HTML VALIDATOR", `${`${dir}/${file?.name}`.split('/docs/')[1]} is an invalid subdir/markdown file`);
        urlsArr = [];
      }
    });
  });
};

const main = async () => {
  try {
    printMessage(`External Dir ---->>> ${args}`);
    if (args?.length > 0) {
      mdHtmlValidator(folder);
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