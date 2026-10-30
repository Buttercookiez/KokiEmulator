import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {unzipSync} from 'fflate';
const {extractFile}=createRequire(import.meta.url)('@electron/asar');
async function list(dir,prefix=''){const files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true}))files.push(...entry.isDirectory()?await list(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);return files;}
for(const [system,version,dir,dist,apkName,exe] of [
  ['GBA','0.4.5','release','dist','koki-emulator-android-debug.apk','Kokis-Emulator-0.4.5-Windows.exe'],
  ['NDS','0.2.2','release-nds','dist-nds','Koki-NDS-0.2.2-Android.apk','Koki-NDS-0.2.2-Windows.exe'],
]) {
  const apk=unzipSync(await fs.readFile(path.join(dir,apkName))),asar=path.join(dir,'win-unpacked/resources/app.asar');
  const files=await list(dist);
  for(const name of files){const bytes=await fs.readFile(path.join(dist,name));assert(bytes.equals(Buffer.from(apk['assets/public/'+name]||[])),'Stale APK asset '+name);assert(bytes.equals(extractFile(asar,path.join(dist,name))),'Stale Windows asset '+name);}
  assert.equal(JSON.parse(extractFile(asar,'package.json').toString()).version,version);
  const artifacts=[];
  for(const file of [exe,apkName]){const bytes=await fs.readFile(path.join(dir,file));artifacts.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  const report={system,version,artifacts,matchingFrontendAssets:files.length,tests:'82 Vitest tests and 11 native filesystem tests passed; mobile browser test passed for both systems: editing one game, clearing older overrides, reload and matching controls in the second game; GBA/NDS header labels checked.',physicalDeviceTesting:'Not performed for this UI update.'};
  await fs.writeFile(path.join(dir,'controller-verification.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(path.join(dir,'SHA256SUMS.txt'),artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n');
  console.log(system,version,artifacts);
}
