#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser'); 
const args = process.argv.slice(2); 
const folder = args?.[0]+"/reference"; 
const showdown = require('showdown');
const {errorMsg,errorMessage  , printMessage} = require('./utils/tools');
const { enrichHTMLFromMarkup, showdownHighlight } = require('./utils/md-utils'); 

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
            check = await parseAPIData(fileName , parsedData , apiJson); 
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


const parseAPIData = async (fileName , parsedData , apiJson) => {
  let check = false;
  try{
    for (const [path, obj] of Object.entries(apiJson.paths)) {

      for (const [reqType, api] of Object.entries(obj)) {

        if (typeof api !== 'object' || api === null) {  continue;  }
          if( api['x-proxy-name']){ 
            check = true; 
          } else{ 
            if (!api.hasOwnProperty('x-proxy-name')){  
              errorMessage('YAML VALIDATOR'  ,`File :${fileName} API-Path:${path} Error: Missing 'x-proxy-name'`); 
            } 
            check = false; 
            return;
          } 
          const version =  fileName.split('/')[1];
          check = validateIndexBody(fileName ,parsedData , apiJson, path , reqType , api , version); 
          //console.log(`check : ${check}`);
      }
    } 
      if (check){
      printMessage(`File: ${fileName} : PASSED`);
      } else {
        errorMsg(`Validation error in file ${fileName}`); 
      }
  } catch (err) {
    errorMsg(`Error: ${e.message}`);
  }
  return check;
};


const validateIndexBody = (fileName , yamlData ,yamlJSONData ,path , reqType , api , version) =>{
 let check = true;
  try{
    const pathJSON = yamlJSONData.paths[path][reqType]; 
    const converter = new showdown.Converter({
      ghCompatibleHeaderId: true,
      emoji: true,
      disableForced4SpacesIndentedSublists: true,
      literalMidWordUnderscores: true,
      tables: true,
      extensions: [enrichHTMLFromMarkup(), showdownHighlight],
    });

    const strRequestBody = pathJSON.requestBody ? JSON.stringify(pathJSON.requestBody, (key, value) => {
      if (key === 'description' && typeof value === 'string') {
        return converter.makeHtml(value);
      } else{
        return value;
      }
    }) : '';

    const strResponses = pathJSON.responses ? JSON.stringify(pathJSON.responses, (key, value) => {
      if (key === 'description' && typeof value === 'string') {
        return converter.makeHtml(value);
      } else{
        return value;
      }
    }) : '';

    const strParameters = pathJSON.parameters ? JSON.stringify(pathJSON.parameters) : '';

    body = {
  
      title: api['x-proxy-name'] ? api['x-proxy-name'] : (api.tags ? api.tags[0] : api.summary),
      titleKW: api['x-proxy-name'] ? api['x-proxy-name'] : (api.tags ? api.tags[0] : api.summary), 
      summary: api.summary,
      path,
      description: api.description ? api.description : '',
      tags: api.tags,
      requestType: reqType,
      requestBody: strRequestBody,
      xGroupName: api['x-group-name'] ? api['x-group-name'] : '',
      xProxyName: api['x-proxy-name'] ? api['x-proxy-name'] : '',
      xDisableDefaultExample: api['x-disable-default-example'] ? api['x-disable-default-example'] : false,
      responses: strResponses,
      parameters: strParameters,
      servers: yamlData.servers,   
      version: version,
      xLinks: api['x-links'] ? api['x-links'] : {},
      childProductName: Array.isArray(api['x-child-product-name']) ? api['x-child-product-name'] : [api['x-child-product-name']],     
      xDefaultExample: api['x-default-example'] ? api['x-default-example'] : '',
      xCore: api['x-core'] ? api['x-core'] : '',
      xDefaultCore: api['x-core-default'] ? api['x-core-default'] : '',
      xUseCases: api['x-use-cases'] ? api['x-use-cases'] : [],
    };  
  }catch(e){
    errorMessage('YAML VALIDATOR ' ,`File :${fileName} with ${e?.message}`);
    check = false;
  }  

  return check;
}


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