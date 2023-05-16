#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml'); 
const args = process.argv.slice(2); 
const folder = args?.[0]+"/config"; 
const {errorMessage , errorMsg  , printMessage} = require('./utils/tools')
const ded_validator  = 'DED VALIDATOR';
const pdl_validator  = 'Product Layout VALIDATOR'; 
const tenant_config_validator = 'TENANT CONFIG VALIDATOR'; 
let check = true;

const validateDir = async (dir) => { 

  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    let check = true;
    
    if (file.name === 'document-explorer-definition.yaml'){ 
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, 'utf8');
        const apiJson = yaml.load(content);  
      } catch (e) {
        errorMessage(ded_validator  ,e?.message);
        check = false;
      }
      if (check){
        printMessage(`${ded_validator} : PASSED`); 
      }else{
        errorMessage(ded_validator  ,"FAILED");
      }
    } 

    if (file.name === 'product-layout.yaml'){ 
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, 'utf8');
        const apiJson = yaml.load(content);  
      } catch (e) {
        errorMessage(pdl_validator  ,e?.message);
        check = false;
      }
      if (check){ 
        printMessage(`${pdl_validator} : PASSED`); 
      }else{
        errorMessage(pdl_validator  ,"FAILED");
      }
    } 

    if (file.name === 'tenant.json'){
      try{ 
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, 'utf8'); 
        const data = JSON.parse(content); 
        check = validateSpecExistence(args?.[0] , data); 
      }catch (e){
        errorMessage(tenant_config_validator  ,e?.message);
        check = false;
      } 

      if (check){ 
        printMessage(`${tenant_config_validator} : PASSED`);
      }else{
        errorMessage( tenant_config_validator , 'FAILED');
      }
    } 
  }
}; 
  
const validateSpecExistence = (dir , tenantData)=> {  
  let specExistence = true;
  
  if (tenantData?.apiVersions.length > 0){
    for (const item of tenantData.apiVersions) {  
      const version = item.version ;  
      const apiSpecFiles = item.apiSpecFileNames ; 
        
      if (apiSpecFiles.length > 0){
        for (const filePath of apiSpecFiles) {
          const file = `${dir}/reference/${version}/${filePath}.yaml`;
          if (!fs.existsSync(file)) {  
            errorMsg(`${file} - Missing`);
            specExistence = false;
          }
        }
      }  
    }
  } 
    
  return specExistence;
};


const main = async() => { 
  try {
    printMessage(`External Dir ---->>> ${folder}`);   
    if ( args?.length > 0){ 
      await validateDir(folder);
      if (check){
        printMessage(`External Dir ---->>> ${folder}`); 
      }
    }else{
      errorMessage('YAML VALIDATOR'  ,'No Path for reference dir. defined');
    }
  } catch (e) {
    errorMessage('YAML VALIDATOR'  ,e.message);
  }

};

if (require.main === module) {
  main();
}

