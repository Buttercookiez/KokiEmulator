import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(), token=randomUUID(), profile=path.join(root,'.cache/nds-tests/migration-profile-'+token);
// A brand-new Chromium profile and a server on a unique port isolate every file operation.
await fs.mkdir(profile,{recursive:false});
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','nds','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',windowsHide:true});
let context;
try {
 for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,viewport:{width:1280,height:900}});
 const page=await context.newPage();await page.goto(origin);
 const sample=await fs.readFile('.cache/nds-tests/koki-ds-diagnostic.nds'),sampleHash=createHash('sha256').update(sample).digest('hex');
 const testGame=await page.evaluate(async({bytes,hash,token,origin})=>{
  if(location.origin!==origin||window.kokiNative)throw Error('Test storage is not isolated');
  const l=await import('/src/lib/library.ts');if((await l.getGames()).length!==0)throw Error('Expected an empty test profile');
  localStorage.setItem('koki-migration-test-only',token);
  const result=await l.importGames([new File([new Uint8Array(bytes)],'koki-migration-diagnostic.nds')]);
  const game=result.imported.find(item=>item.hash===hash);if(result.imported.length!==1||!game)throw Error('Expected only the generated test ROM');
  const save=new Uint8Array(128*1024);save[0]=77;await l.writeBattery(game.id,save);
  const state=await l.createSnapshot(game.id,new Uint8Array([9,8,7]),{kind:'auto',label:'Legacy test checkpoint'});
  const storage=await import('/src/lib/storage.ts'),index=JSON.parse(new TextDecoder().decode(await storage.readFile('library.json')));
  delete index.ndsEngine;delete index.snapshots.find(item=>item.id===state.id).engine;
  await storage.writeFile('library.json',new TextEncoder().encode(JSON.stringify(index)));return{game:game.id,state:state.id};
 },{bytes:[...sample],hash:sampleHash,token,origin});
 assert.equal(testGame.game,sampleHash);
 await page.reload();await page.getByRole('button',{name:'Play koki-migration-diagnostic',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('canvas')?.getContext('2d').getImageData(120,96,1,1).data[2]>200);
 const migrated=await page.evaluate(async test=>{const l=await import('/src/lib/library.ts'),s=await import('/src/lib/storage.ts');return{states:await l.getSnapshots(),oldState:[...await l.getSnapshotData(test.state)],backupSave:(await s.readFile('migrations/pre-0.1.1/'+test.game+'.sav'))?.[0],backupIndex:!!await s.readFile('migrations/pre-0.1.1/library.json')};},testGame);
 assert.equal(migrated.states.find(x=>x.id===testGame.state).engine,'pilas-legacy');assert.equal(migrated.states.find(x=>x.id===testGame.state).kind,'backup');assert.deepEqual(migrated.oldState,[9,8,7]);assert.equal(migrated.backupSave,77);assert(migrated.backupIndex);
 await page.locator('canvas').focus();await page.keyboard.press('F5');await page.getByText('Checkpoint saved on this device',{exact:true}).waitFor();
 const data=await page.evaluate(async test=>{const l=await import('/src/lib/library.ts');const state=(await l.getSnapshots()).find(x=>x.kind==='manual');const bytes=await l.getSnapshotData(state.id);return{engine:state.engine,bytes:bytes.length,magic:new TextDecoder().decode(bytes.subarray(0,8)),legacyStillPresent:(await l.getSnapshots()).some(x=>x.id===test.state)};},testGame);
 assert.equal(data.engine,'skyemu-f4d3238b-koki1');assert.equal(data.magic,'KOKINDSZ');assert(data.bytes<1024*1024);assert(data.legacyStillPresent);
 await page.locator('canvas').focus();await page.keyboard.press('Tab');await page.getByRole('button',{name:'Save and return to library',exact:true}).press('Enter');await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
 const removed=await page.evaluate(async({test,token,origin,hash})=>{
  const l=await import('/src/lib/library.ts');const games=await l.getGames();
  if(location.origin!==origin||window.kokiNative||localStorage.getItem('koki-migration-test-only')!==token||games.length!==1||!games.some(item=>item.id===hash&&item.id===test.game&&item.fileName==='koki-migration-diagnostic.nds'))throw Error('Refusing to remove data outside the isolated generated-ROM fixture');
  await l.deleteGame(test.game);
  const s=await import('/src/lib/storage.ts'),archived=JSON.parse(new TextDecoder().decode(await s.readFile('migrations/pre-0.1.1/library.json')));
  return{oldSave:!!await s.readFile('migrations/pre-0.1.1/'+test.game+'.sav'),archivedGames:archived.games.length,archivedStates:archived.snapshots.length};
 },{test:testGame,token,origin,hash:sampleHash});
 assert.deepEqual(removed,{oldSave:false,archivedGames:0,archivedStates:0});
 const report={status:'passed',isolation:{profile,origin,fixture:'Generated 64 KiB diagnostic only'},checks:['Legacy checkpoint retained and excluded from auto-resume','Pre-upgrade index and save retained','New checkpoints compressed','Deleting the generated fixture removes its recovery data'],compressedCheckpointBytes:data.bytes};
 await fs.writeFile('.cache/nds-tests/migration-report.json',JSON.stringify(report,null,2));console.log(report);
} finally {await context?.close();server.kill();}
