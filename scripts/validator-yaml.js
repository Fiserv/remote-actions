#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser'); 
const args = process.argv.slice(2); 
const folder = args?.[0]+"/reference"; 

const {errorMsg,errorMessage  , printMessage} = require('./utils/tools')

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
          let fileName = `${dir}/${file.name}`;
          const content = fs.readFileSync(fileName, 'utf8');
          const apiJson = yaml.load(content);
          const tenantName =  args[0].split('/').pop(); 
          fileName = fileName.split(`/${tenantName}/`)[1];
          if (!apiJson.paths || !Object.keys(apiJson.paths).length) {
            errorMessage('YAML VALIDATOR'  ,'No path provided!');
          }
          const parsedData = await SwaggerParser.validate(apiJson);

          if (parsedData){
            check = await parseAPIData(fileName , apiJson);
            }
        } catch (e) {
          errorMessage('YAML VALIDATOR'  ,`File : ${file.name} : FAILED`);
          errorMsg(`Error: ${e.message}`);
        }
      }else{
        errorMessage('YAML VALIDATOR'  ,`Not a YAML Spec file : ${file.name}`);
      }
    });
  });
};


const parseAPIData = async (fileName , apiJson) => {
  let check = false;
  try{
    for (const [path, obj] of Object.entries(apiJson.paths)) {

      for (const [reqType, api] of Object.entries(obj)) {

        if (typeof api !== 'object' || api === null) { 
          continue; 
        }

          if( api['x-proxy-name']){ 
            check = true; 
          } else{ 

            if (!api.hasOwnProperty('x-proxy-name')){  
              errorMessage('YAML VALIDATOR'  ,`File :${fileName} API-Path:${path} Error: Missing 'x-proxy-name'`); 
            } 
            check = false; 
            return;
          }
      }
    } 
      if (check){
      printMessage(`File: ${fileName} : PASSED`);
      }
 
  } catch (err) {
    console.log(err?.message);
  }
  return check;
};


const main = async() => {

  try {
    printMessage(`External Dir ---->>> ${folder}`);   
    if ( args?.length > 0){ 
    await validateDir(folder);
   }else{
    errorMessage('YAML VALIDATOR'  ,'No Path for reference dir. defined');
   }
  } catch (e) {
    errorMessage('YAML VALIDATOR'  ,e.message);
  }
}

if (require.main === module) {
  main();
}