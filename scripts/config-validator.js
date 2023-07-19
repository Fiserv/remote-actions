#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml'); 
const args = process.argv.slice(2); 
const folder = args?.[0]+"/config"; 
const {errorMessage , errorMsg  , printMessage , provideReferenceFolder} = require('./utils/tools')
const ded_validator  = 'DED VALIDATOR';
const pdl_validator  = 'Product Layout VALIDATOR'; 
const tenant_config_validator = 'TENANT CONFIG VALIDATOR'; 
let check = true;
let dedFileExistence = true;
const validateDir = async (dir) => { 

  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    let check = true;
    
    if (file?.name === 'document-explorer-definition.yaml'){ 
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, 'utf8');
        const apiJson = yaml.load(content); 
        check = validateDocLinks(args?.[0] , apiJson);
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

    if (file?.name === 'product-layout.yaml'){ 
      try {
        const fileName = `${dir}/${file.name}`;
        const content = await fs.promises.readFile(fileName, 'utf8');
        const apiJson = yaml.load(content); 
        
        if (!apiJson?.getStarted){
          errorMsg(`${file?.name} missing Getting Started link ! `); 
          check = false;
        }else{ 
          const file = `${args}${apiJson?.getStarted}`; 
          if (!fs.existsSync(file)) {  
            errorMsg(`${apiJson?.getStarted} doesn't exist in docs directory`);  
            check = false;
          } 
        }
        
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

    if (file?.name === 'tenant.json'){
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

const validateDocLinks = (dir , arr) => { 
  try{
    arr.forEach(obj => {
      if (obj?.link !== undefined && obj.link !== null) { 
    
        const file = `${dir}/${obj?.link}`;
        if (!fs.existsSync(file)) {  
          errorMsg(`${file} - Missing`);
          dedFileExistence = false;
        } 
      }
      if (obj?.sections) {
        validateDocLinks(dir , obj?.sections);
      }
    });
  }catch(e){ 
    dedFileExistence = false;
  }  
  return dedFileExistence;
}
 
  
const validateSpecExistence = (dir , tenantData)=> {  
  let specExistence = true;
  let MajorVersionCheck =0 , MajorVersion = 0;
  let versions = [];
  
  if (tenantData?.apiVersions && tenantData?.apiVersions.length > 0){
    for (const item of tenantData.apiVersions) {  
      const version = item?.version ;  
      const versionType = item?.versionType; 
      versions.push(version); 
      if (versionType === 'major'){
        MajorVersionCheck++;
        MajorVersion = version;
      }

      const apiSpecFiles = item.apiSpecFileNames ;  
      if (apiSpecFiles.length > 0){
        for (const filePath of apiSpecFiles) { 
          const file = `${provideReferenceFolder(dir)}/${version}/${filePath}.yaml`;
          if (!fs.existsSync(file)) {  
            errorMsg(`${file} - Missing`);
            specExistence = false;
          } 
        }
      }   
    } 
      // Checking only one Major version is published in tenant config file
      if (MajorVersionCheck > 1){
          errorMsg(`Multiple Major Versions found in TenantConfig file`);
          specExistence = false;
        } else{
           // Checking Major version is the highest version available amoung all versions.  
        const sortedVersions = sortVersionsDescending(versions); 
        if (sortedVersions.length > 0 ) {
          if (sortedVersions[0] != MajorVersion){
            errorMsg(`Incorrect API major version assignment : ${MajorVersion}. 
            Please use correct versioning pattern (use Major, Minor and Patch) suggested Major version: ${sortedVersions[0]}`);
            specExistence = false;
        }
        } 
      } 
  }  
  return specExistence;
};


const sortVersionsDescending = (versions) => {
  return versions.sort((a, b) => {
    const aParts = a.split('.');
    const bParts = b.split('.');
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      if (parseInt(bParts[i] || 0) !== parseInt(aParts[i] || 0)) {
        return parseInt(bParts[i] || 0) - parseInt(aParts[i] || 0);
      }
    }
    return 0;
  });
}


const main = async() => { 
  try {
    printMessage(`External Dir ---->>> ${folder}`);   
    if ( args?.length > 0){ 
      await validateDir(folder);
      if (check){
        printMessage(`External Dir ---->>> ${folder}`); 
      }
    }else{
      errorMessage('Tenant Config VALIDATOR'  ,'No Path for reference dir. defined');
    }
  } catch (e) {
    errorMessage('Tenant Config VALIDATOR'  ,e.message);
  }

};

if (require.main === module) {
  main();
}

