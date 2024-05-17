#!/usr/bin/env node

const showdown = require('showdown');
const fs = require('fs'); 
const markdownlint = require("markdownlint");
const args = process.argv.slice(2); 
const folder = args?.[0]+"/docs";
const { enrichHTMLFromMarkup, showdownHighlight, mdExtension } = require('./utils/md-utils'); 
const {errorMessage  , printMessage} = require('./utils/tools')
const html_validator = require('html-validator')
const https = require('https');
let urlsArr =[];

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
        type: 'output',
        regex: /<a\shref[^>]+>/g,
        replace: function (text) {  
          const url = text.match(/"(.*?)"/)[1];
          if (url.startsWith('http:') || url.startsWith('https:')) {  
            urlsArr.push(url);
            return '<a href="' + url + '" target="_blank">';
          }
          return text;
        },
      },
    ];
  }, 'externalLink');

const markdownlinter = async (dir) => {  
    fs.readdir(dir, { withFileTypes: true }, (err, files) => {
      files.forEach(async file => { 
        if (file.isDirectory()) {
          markdownlinter(`${dir}/${file.name}`);
        } else if (/\.md$/.test(file.name)){ 
          try {
            let fileName = `${dir}/${file.name}`;   
              const options = { 
                "files": [ fileName],  
                "config": {
                    "default": true,
                    "no-hard-tabs": false,
                    "whitespace": false,
                    "line_length": false,
                }
              };
           // const result = markdownlint.sync(options);
           markdownlint(options, function callback(err, result) {
            if (!err) {
              if (result.toString().length > 0){ 
                errorMessage('MD VALIDATOR' , `PLEASE CHECK FOLLOWING LINTER ISSUES WITHIN THE FILE : ${fileName}`);
                printMessage(result);
              }else{
                printMessage(`${fileName} - PASSED`);
              } 
            }
          });
         
          } catch (e) {
            errorMessage('MD VALIDATOR' ,e.message);
          }
        }else{
          errorMessage('MD VALIDATOR' ,`Invalid subdir or file extension : ${dir}/${file.name}`);
        }
      });   
    });  
};
 
const mdHtmlValidator= async (dir) => {  
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files?.forEach(async file => { 
      if (files?.isDirectory()) {
        markdownValidator(`${dir}/${file.name}`);
      } else if (/\.md$/.test(file.name)){ 
        try {
          let fileName = `${dir}/${file.name}`; 
          const content = fs.readFileSync(fileName, 'utf8'); 
          const htmlData = converter.makeHtml(content);   
            
          // const options = {
          //   validator: 'WHATWG',
          //   data: htmlData,
          //   isFragment: true
          // }
         
           
          for (const url of urlsArr ) {
            console.log('Url ' +url);
            // const options = {
            //   url: 'https://localhost:8080/api/healthcheck',
            //  // format: 'text'
            //  // isLocal: true
            // }
            // const result = await html_validator(options) ;
            const privateKey = fs.readFileSync('/Users/f2zdirk/Desktop/ssl/key.pem', 'utf8');
            const certificate = fs.readFileSync('/Users/f2zdirk/Desktop/ssl/cert.pem' , 'utf-8');
 
            const postData = JSON.stringify({
              'msg': 'Hello World!'
            });
            
            const options = {
              hostname: 'https://github.com',
              port: 80,
              path: '/Fiserv/sample-tenant-repo',
              method: 'HEAD',
              headers: {
                'Content-Type': 'application/json' 
              }
            };
            
            const req = https.request(options, (res) => {
              console.log(`STATUS: ${res.statusCode}`);
              console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
              res.setEncoding('utf8');
              res.on('data', (chunk) => {
                console.log(`BODY: ${chunk}`);
              });
              res.on('end', () => {
                console.log('No more data in response.');
              });
            });
            
            req.on('error', (e) => {
              console.error(`problem with request: ${e.message}`);
            });
            
            // Write data to request body
            req.write(postData);
            req.end();
          
          }  

        } catch (e) {
          errorMessage('MD VALIDATOR' ,e.message);
        }
      }else{
        errorMessage('MD VALIDATOR' ,'Invalid subdir or Not a markdown file.');
      }
    });   
  });  
};

try {
  console.log(`External Dir ---->>> ${args}`);   
 if ( args?.length > 0){ 
  markdownlinter(folder); 
  //mdHtmlValidator(folder);
 }else{  
  errorMessage('MD VALIDATOR' ,'No Path for docs dir. defined');
 }
} catch (e) {
  errorMessage('MD VALIDATOR' ,e.message);
}
