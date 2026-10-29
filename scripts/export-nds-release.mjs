import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { zipSync } from 'fflate';
const root=process.cwd(), require=createRequire(import.meta.url), {extractFile}=require('@electron/asar');
const source=JSON.parse(await fs.readFile('engines/nds-source-manifest.json','utf8'));
const core=JSON.parse(await fs.readFile('engines/nds-manifest.json','utf8'));
const bridge=await fs.readFile('engines/nds-core/koki-nds.c');
if(createHash('sha256').update(bridge).digest('hex')!==core.bridgeSha256)throw Error('Bridge source does not match the engine manifest');
const bundled=extractFile('release-nds/win-unpacked/resources/app.asar',path.join('engines','nds-core','koki-nds.c'));
if(!bundled.equals(bridge))throw Error('Packaged Windows source is stale');
const files={};for(const name of ['engines/nds-core/koki-nds.c','engines/nds-core/LICENSE','engines/nds-source-manifest.json','engines/nds-manifest.json','scripts/build-nds-core.mjs','docs/NDS-CORE.md','licenses/nds/SkyEmu-MIT.txt','licenses/nds/BIOS-replacement-BSD-2-Clause.txt','licenses/nds/ROM-database-MIT.txt','licenses/nds/Runtime-notices.txt'])files[name]=new Uint8Array(await fs.readFile(name));
for(const item of source.files){const bytes=await fs.readFile(path.join('.cache/nds-source/skyemu',item.file));if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Source hash mismatch '+item.file);files['upstream/skyemu/'+item.file]=new Uint8Array(bytes);}
files['README.md']=new TextEncoder().encode('# Koki NDS 0.1.1 engine source\n\nThis archive contains the complete pinned DS core inputs, open BIOS replacement source/headers, Koki bridge, licenses, manifests and build script.\n\nInstall Node 22.12+ and Emscripten 4.0.23. Activate its environment; set EMSDK and EMSDK_PYTHON as needed. Set KOKI_NDS_SOURCE_DIR to this archive\'s absolute upstream/skyemu folder and run node scripts/build-nds-core.mjs from this directory. The build verifies its JS/WASM outputs against engines/nds-manifest.json.\n\nSee docs/NDS-CORE.md for source URLs, compiler revision, licensing, flags and the checkpoint boundary. The full Koki app source is in https://github.com/Buttercookiez/KokiEmulator at tag nds-v0.1.1.\n');
await fs.writeFile('release-nds/Koki-NDS-0.1.1-source.zip',zipSync(files,{level:9}));
const info=JSON.parse(await fs.readFile('release-nds/BUILD-INFO.json','utf8'));
const all=info.artifacts.concat(core.artifacts.map(a=>({...a,local:'engines/nds/'+a.file})),[{file:'Koki-NDS-0.1.1-source.zip'}]);
const lines=[];for(const item of all){const bytes=await fs.readFile(item.local||'release-nds/'+item.file);const sha=createHash('sha256').update(bytes).digest('hex');if(item.sha256&&sha!==item.sha256)throw Error('Asset checksum mismatch '+item.file);lines.push(sha+'  '+item.file);}
await fs.writeFile('release-nds/SHA256SUMS.txt',lines.join('\n')+'\n');
await fs.copyFile('release-nds/BUILD-INFO.json','release-nds/Koki-NDS-0.1.1-verification.json');
await fs.copyFile('docs/NDS.md','release-nds/START-HERE.md');
console.log({sourceFiles:Object.keys(files).length,sourceArchiveBytes:(await fs.stat('release-nds/Koki-NDS-0.1.1-source.zip')).size,verifiedAssets:all.length});
