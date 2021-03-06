#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser'); 
const args = process.argv.slice(2); 
const folder = args?.[0]+"/reference"; 

const {errorMessage  , printMessage} = require('./utils/tools')

// const failValidation = (message) => {
//   printMessage('------------------------- YAML VALIDATOR FAILED --------------------------') 
//   printMessage(message)
// };

/* VALIDATION RULES
   -  `YAML` Extension check 
   -  Custom Tags check 
      - x-proxy-name
      - x-group-name

*/

const validateDir = async (dir) => {
  let check = false;
  fs.readdir(dir, { withFileTypes: true }, (err, files) => {
    files?.forEach(async file => {

      if (file?.isDirectory()) {
        validateDir(`${dir}/${file.name}`);
      } else if (/\.yaml$/.test(file.name)){

        try {
          const fileName = `${dir}/${file.name}`;
          const content = fs.readFileSync(fileName, 'utf8');
          const apiJson = yaml.load(content);
          if (!apiJson.paths || !Object.keys(apiJson.paths).length) {
            errorMessage('YAML VALIDATOR'  ,'No path provided!');
          }
          const parsedData = await SwaggerParser.validate(apiJson);
          if (parsedData){
              for (const [path, obj] of Object.entries(apiJson.paths)) {
                for (const [reqType, api] of Object.entries(obj)) {
                  if (typeof api !== 'object' || api === null) { continue; }
                    if( (api['x-group-name']) && api['x-proxy-name']){
                      check = true;
                    } else{ 
                      if (!api.hasOwnProperty('x-proxy-name')){ 
                        errorMessage('YAML VALIDATOR'  ,`${fileName} - Missing 'x-proxy-name'`);
                      } 
                      if (!api.hasOwnProperty('x-group-name')){ 
                        errorMessage('YAML VALIDATOR'  ,`${fileName} - Missing 'x-group-name'`);
                      } 
                      check = false;
                      return;
                    }
                }
              } 
                if (check){
                printMessage(`${fileName} - PASSED`);
                }
            }
        } catch (e) {
          errorMessage('YAML VALIDATOR'  ,e.message);
        }
      }else{
        errorMessage('YAML VALIDATOR'  ,'Invalid subdir or file extension.');
      }
    });
  });
};

try {
  printMessage(`External Dir ---->>> ${folder}`);   
  if ( args?.length > 0){ 
  validateDir(folder);
 }else{
  errorMessage('YAML VALIDATOR'  ,'No Path for reference dir. defined');
 }
} catch (e) {
  errorMessage('YAML VALIDATOR'  ,e.message);
}
