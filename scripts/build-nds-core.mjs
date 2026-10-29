import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(await fs.readFile(path.join(root,'engines/nds-source-manifest.json'),'utf8'));
const cached=process.env.KOKI_NDS_SOURCE_DIR||path.join(root,'.cache/nds-source/skyemu');
for(const file of source.files){const target=path.join(cached,file.file);let bytes;try{bytes=await fs.readFile(target);}catch{}if(!bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256){const response=await fetch(`${source.repository.replace('https://github.com/','https://raw.githubusercontent.com/')}/${source.revision}/${file.file}`);if(!response.ok)throw Error('Could not fetch pinned source '+file.file);bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Source integrity check failed: '+file.file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}}
if(process.argv.includes('--source-only'))process.exit(0);
const sdk=process.env.EMSDK||path.join(root,'.cache/nds-tools/emsdk');
const python=process.env.EMSDK_PYTHON||(process.platform==='win32'?path.join(sdk,'python/3.13.3_64bit/python.exe'):'python3');
const output=path.join(root,'engines/nds');await fs.mkdir(output,{recursive:true});
const args=[path.join(sdk,'upstream/emscripten/emcc.py'),'engines/nds-core/koki-nds.c','-I'+cached,'-I'+path.join(cached,'src'),'-O3','-fno-strict-aliasing','-fwrapv','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createKokiNds','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=134217728','-sSTACK_SIZE=2097152','-sEXPORTED_FUNCTIONS=["_malloc","_free"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP16","UTF8ToString"]','-sENVIRONMENT=web,worker,node','-sDYNAMIC_EXECUTION=0','-sASSERTIONS=0','-Wno-incompatible-pointer-types','-Wno-format','-o',path.join(output,'koki-nds-core.js')];
await new Promise((resolve,reject)=>{const child=spawn(python,args,{cwd:root,env:{...process.env,EM_CONFIG:path.join(sdk,'.emscripten')},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('NDS source build failed: '+code)));});
const licenseParts=[];for(const file of ['engines/nds-core/LICENSE','licenses/nds/SkyEmu-MIT.txt','licenses/nds/BIOS-replacement-BSD-2-Clause.txt','licenses/nds/ROM-database-MIT.txt','licenses/nds/Runtime-notices.txt'])licenseParts.push(file+'\n\n'+await fs.readFile(path.join(root,file),'utf8'));
await fs.writeFile(path.join(output,'LICENSE.txt'),licenseParts.join('\n\n---\n\n'));
const artifacts=[];for(const file of ['koki-nds-core.js','koki-nds-core.wasm','LICENSE.txt']){const bytes=await fs.readFile(path.join(output,file));artifacts.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'https://github.com/Buttercookiez/KokiEmulator/releases/download/nds-v0.1.1/'+file});}
const manifest={name:'SkyEmu DS / Koki source bridge',engineId:'skyemu-f4d3238b-koki1',repository:source.repository,revision:source.revision,license:'MIT / BSD-2-Clause',builtFromSource:true,bridgeSha256:createHash('sha256').update(await fs.readFile(path.join(root,'engines/nds-core/koki-nds.c'))).digest('hex'),sourceManifest:'engines/nds-source-manifest.json',buildScript:'scripts/build-nds-core.mjs',artifacts};
if(process.argv.includes('--update-manifest'))await fs.writeFile(path.join(root,'engines/nds-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
else{const expected=JSON.parse(await fs.readFile(path.join(root,'engines/nds-manifest.json'),'utf8'));for(const a of artifacts)if(expected.artifacts.find(b=>b.file===a.file)?.sha256!==a.sha256)throw Error('Rebuilt artifact differs: '+a.file);}
console.log('Source-built NDS core: '+artifacts.map(x=>x.file+' '+x.bytes+' bytes').join(', '));
