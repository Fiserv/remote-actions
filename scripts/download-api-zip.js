#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser');
const AdmZip = require('adm-zip');
const postmanConverter = require('openapi-to-postmanv2');
const args = process.argv.slice(2);
const folder = `${args?.[0]}/reference`;

const { errorMessage, printMessage } = require('./utils/tools');
const postman_zip  = new AdmZip() , spec_zip = new AdmZip();
const specZipFile = args[0]?.includes("/") ? args[0].split('/').pop()+'_spec' : 'tennat_spec';
const postmanZipFile = args[0]?.includes("/") ? args[0].split('/').pop()+'_postman' : 'tennat_postman';

    const generateZipCollection = async (dir) => {
    const files = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        await generateZipCollection(`${dir}/${file.name}`);
      } else if (/\.yaml$/.test(file.name)) {
        try {
          const fileName = `${dir}/${file.name}`;
          const content = await fs.promises.readFile(fileName, 'utf8');
          const apiJson = yaml.load(content);
          if (!apiJson.paths || !Object.keys(apiJson.paths).length) {
            errorMessage('ZIP GENERATOR', 'No path provided!');
            continue;
          }
          const parsedData = await SwaggerParser.validate(apiJson);

          if (parsedData) {
            let check = false;
            for (const [path, obj] of Object.entries(apiJson.paths)) {
              for (const [reqType, api] of Object.entries(obj)) {
                if (typeof api !== 'object' || api === null) { continue; }
                if (api['x-group-name'] && api['x-proxy-name']) {
                  check = true;
                } else {
                  if (!api.hasOwnProperty('x-proxy-name')) {
                    errorMessage('ZIP GENERATOR', `${fileName} - Missing 'x-proxy-name'`);
                  }
                  check = false;
                  break;
                }
              }
              if (!check) {
                break;
              }
            }
            if (check) { 
              const tenant_repo = getTenantRepoName(dir);
              printMessage(`Sub Dir accessed ---${dir}`);  
              printMessage(`Tenant files  :${tenant_repo}`);
             
              if (await generateSpecZipCollection(tenant_repo ,  file , content )){
                printMessage(`Spec File : ${file.name} added to Zip`);
              }
       
              const postmanFileName = file.name.includes('.yaml') ? file?.name.split('.yaml')[0].concat('-postman.json') : `${file.name}-postman.json`;
              if (await generatePostmanCollection(tenant_repo , postmanFileName , content )){
                printMessage(`Postman Collection: ${file?.name} added to Zip`);
              }
            }
          }
        } catch (e) {
          errorMessage('ZIP GENERATOR', e.message);
        }
      } else {
        errorMessage('ZIP GENERATOR', 'Invalid subdir or file extension.');
      }
    }
    };

    const getTenantRepoName = (str) => { 
      const data = {}
      const parts = str.split('/reference'); 
      if (parts.length > 1) {   
        const arr = parts[0].split('/');
        const name = arr[arr.length - 2];  
        const filePath = parts[1];
        data.repo = name;
        data.path = filePath;  
        return data;
      }
      return null; 
    }

    const generateSpecZipCollection = async(folder , file , content ) => {  
      try{
      
        if (folder === '../reference') {
          spec_zip.addFile(file.name, Buffer.from(content, 'utf8'), 'Adding folders');
        } else {
          spec_zip.addFile(`${folder?.repo}/${folder?.path}/${file.name}`, Buffer.from(content, 'utf8'), 'Adding file');
        }
        spec_zip.writeZip(`${args}/assets/${specZipFile}.zip`);
       
      }catch(e){
        errorMessage('SPEC ZIP GENERATOR', e.message);
        return false;
      }
     return true;
    };


    const generatePostmanCollection = async(folder , postmanFileName , content ) => { 
  
      try{

        postmanConverter.convert(
          { type: 'string', data: content },
          { requestParametersResolution: 'Example', folderStrategy: 'Tags' },
          (err, conversionResult) => {
            if (!conversionResult.result) {
              printMessage('Could not convert', conversionResult);
            } else {   
 
                if (folder === '../reference') {
                  postman_zip.addFile(`${postmanFileName}`, JSON.stringify(conversionResult?.output[0]?.data));
                } else {
                  postman_zip.addFile(`${folder?.repo}/${folder?.path}/${postmanFileName}`, JSON.stringify(conversionResult?.output[0]?.data));
                }
                postman_zip.writeZip(`${args}/assets/${postmanZipFile}.zip`); 
            }
          }
        );  
      }catch (e) {
        errorMessage('Postman GENERATOR', e.message);
        return false;
      }
      return true;
    
    }
 
    try {
    printMessage(`External Dir ---->>> ${args}`);
    if (args?.length > 0) {
      generateZipCollection(folder);
    } else {
      errorMessage('ZIP GENERATOR', 'No Path for reference dir. defined');
    }
    } catch (e) {
    errorMessage('ZIP GENERATOR', e.message);
    }