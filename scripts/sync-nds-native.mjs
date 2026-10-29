import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),root=process.cwd(),dir=path.join(root,'.cache/native-nds/core');
const manifest=JSON.parse(await fs.readFile('native/nds/manifest.json','utf8'));
async function git(args){return (await exec('git',args,{cwd:root,windowsHide:true})).stdout.trim();}
if(process.env.KOKI_NDS_OFFLINE_SOURCE!=='1') {
try{await fs.access(path.join(dir,'.git'));}catch{await fs.mkdir(dir,{recursive:true});await git(['init',dir]);await git(['-C',dir,'remote','add','origin',manifest.repository]);await git(['-C',dir,'fetch','--depth=1','origin',manifest.revision]);await git(['-C',dir,'checkout','--detach','FETCH_HEAD']);}
if(await git(['-C',dir,'rev-parse','HEAD'])!==manifest.revision)throw Error('Native DS source revision mismatch');
await git(['-C',dir,'diff','--exit-code']);
} else { const provenance=JSON.parse(await fs.readFile(path.join(dir,'KOKI-SOURCE.json'),'utf8'));if(provenance.revision!==manifest.revision)throw Error('Offline native source revision mismatch');for(const item of provenance.files){const b=await fs.readFile(path.join(dir,item.path));if((await import('node:crypto')).createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('Offline source mismatch: '+item.path);} }
await fs.mkdir('licenses/nds-native',{recursive:true});
await fs.copyFile(path.join(dir,'LICENSE'),'licenses/nds-native/GPL-3.0.txt');
await fs.copyFile(path.join(dir,'src/teakra/LICENSE'),'licenses/nds-native/teakra-MIT.txt');
await fs.copyFile(path.join(dir,'src/fatfs/LICENSE.txt'),'licenses/nds-native/FatFs.txt');
const notice='Koki NDS native Android backend\n\nCore: '+manifest.repository+' at '+manifest.revision+'\nGPL-3.0-or-later. Native ARM64 JIT and threaded software rendering.\nOpen-source FreeBIOS and generated firmware; no Nintendo BIOS included.\nFull source and build instructions: https://github.com/Buttercookiez/KokiEmulator\n\n';
await fs.writeFile('licenses/nds-native/NOTICE.txt',notice);
console.log('Pinned native melonDS source verified.');

const patched=path.join(root,'.cache/native-nds/core-build');
const patch=JSON.parse(await fs.readFile('native/nds/bounded-memory-patch.json','utf8'));
const patchedFiles=new Set(patch.patches.map(p=>p.file));
await fs.cp(dir,patched,{recursive:true,filter:async(source,target)=>{if(source.split(path.sep).includes('.git'))return false;if((await fs.stat(source)).isDirectory())return true;if(patchedFiles.has(path.relative(dir,source).replaceAll('\\','/')))return false;try{const[a,b]=await Promise.all([fs.readFile(source),fs.readFile(target)]);return!a.equals(b);}catch{return true;}}});
const {createHash}=await import('node:crypto');
if(createHash('sha256').update(await fs.readFile('native/nds/bounded-memory-patch.json')).digest('hex')!==manifest.boundedMemoryPatchSha256)throw Error('Native memory patch hash mismatch');
for(const item of patch.patches){const bytes=await fs.readFile(path.join(dir,item.file));if(createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex')!==item.sha256)throw Error('Native patch input mismatch: '+item.file);let source=bytes.toString('utf8').replaceAll('\r\n','\n');for(const [before,after]of item.edits){if(source.split(before).length!==2)throw Error('Native patch context mismatch: '+item.file);source=source.replace(before,after);}source='// Modified for Koki NDS by John Francis Marabe, 2026-10-29: bounded RAM, no fast-memory fault handler.\n'+source;const output=path.join(patched,item.file);let previous;try{previous=await fs.readFile(output,'utf8');}catch{}if(previous!==source)await fs.writeFile(output,source);}
console.log('Bounded native RAM patch staged; upstream source remains unchanged.');
