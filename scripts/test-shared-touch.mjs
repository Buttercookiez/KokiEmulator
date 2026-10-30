import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeDiagnosticRom} from './make-diagnostic-rom.mjs';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  for(const [system,url,rom] of [['GBA','http://127.0.0.1:5184',Buffer.from(makeDiagnosticRom())],['NDS','http://127.0.0.1:5175',await fs.readFile('.cache/nds-tests/koki-ds-diagnostic.nds')]]) {
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page=await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(url);
    const second=Buffer.from(rom); second[second.length-1]^=1;
    await page.getByLabel('Import '+system+' games',{exact:true}).setInputFiles([rom,second].map((buffer,i)=>({name:`Shared ${i+1}.${system.toLowerCase()}`,mimeType:'application/octet-stream',buffer})));
    await page.waitForFunction(()=>document.querySelectorAll('.game-card').length===2);
    await page.evaluate(async()=>{const lib=await import('/src/lib/library.ts'); const settings=await lib.getSettings(); for(const game of await lib.getGames()) await lib.saveGameProfile(game.id,{touchLayouts:settings.touchLayouts,touchOpacity:.25,speed:1.5});});
    await page.reload();
    assert.equal(await page.locator('.mobile-brand .system-brand-label').textContent(),system);
    await page.getByRole('button',{name:'Play Shared 1',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.player-shell')?.dataset.playerState==='running');
    await page.getByRole('button',{name:'Open game menu',exact:true}).click();
    await page.getByRole('button',{name:'Edit controls',exact:true}).click();
    assert.equal(await page.getByRole('combobox',{name:'Save controls for'}).textContent(),'All games');
    await page.getByRole('combobox',{name:'Control preset'}).click();
    await page.getByRole('option',{name:'Large buttons',exact:true}).click();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    const first=await page.locator('.piece-a').boundingBox();
    await page.waitForFunction(async()=>{const lib=await import('/src/lib/library.ts');return (await lib.getGames()).every(g=>!g.profile?.touchLayouts && !g.profile?.touchOpacity);});
    await page.getByRole('button',{name:'Open game menu',exact:true}).click();
    await page.getByRole('button',{name:'Save and return to library',exact:true}).click();
    await page.locator('.player-shell').waitFor({state:'detached'});
    await page.reload();
    await page.getByRole('button',{name:'Play Shared 2',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.player-shell')?.dataset.playerState==='running');
    const other=await page.locator('.piece-a').boundingBox();
    assert.deepEqual(other,first,'Shared layout must render identically in the other game after reload');
    const profiles=await page.evaluate(async()=> (await (await import('/src/lib/library.ts')).getGames()).map(g=>g.profile));
    assert(profiles.every(p=>p.speed===1.5),'Other profile settings must survive');
    await context.close(); console.log(system+': shared controller edits, old overrides, reload, second-game layout and header passed');
  }
} finally {await browser.close();}
