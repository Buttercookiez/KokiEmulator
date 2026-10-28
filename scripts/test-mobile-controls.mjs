import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { makeDiagnosticRom, DIAGNOSTIC_DPAD_PIXELS } from './make-diagnostic-rom.mjs';
const out = '.cache/test-results'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const errors=[]; page.on('pageerror', error=>errors.push(error.message)); page.on('console', entry=>{if(entry.type()==='error')errors.push(entry.text());});
try {
  await page.goto(process.env.KOKI_TEST_URL || 'http://127.0.0.1:5184');
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles({ name:'Touch diagnostic.gba', mimeType:'application/octet-stream', buffer:Buffer.from(makeDiagnosticRom()) });
  const play = () => page.getByRole('button',{name:'Play Touch diagnostic',exact:true}).click();
  const menu = () => page.getByRole('button',{name:'Open game menu',exact:true}).click();
  const edit = async () => { await menu(); await page.getByRole('button',{name:'Edit controls',exact:true}).click(); await page.getByRole('region',{name:'Customize touch controls'}).waitFor(); };
  const piece = key => page.locator('[data-touch-group="'+key+'"]');
  const box = async key => piece(key).boundingBox();
  const color = value => page.waitForFunction(target => { const c=document.querySelector('canvas'); if(!c)return false; const p=c.getContext('2d').getImageData(120,80,1,1).data; return target==='red'?p[0]>200&&p[1]<20:p[1]>200&&p[0]<20; },value);
  const dpad = (key,held) => page.waitForFunction(({pos,held})=>{const p=document.querySelector('canvas').getContext('2d').getImageData(pos.x,pos.y,1,1).data;return held?p[0]>200&&p[1]>200:p[0]<20&&p[1]<20;},{pos:DIAGNOSTIC_DPAD_PIXELS[key],held});
  const within = async () => {
    const viewport=page.viewportSize(); for (const p of await page.locator('[data-touch-group]').all()) { const r=await p.boundingBox(); assert(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1, 'Controls stay inside the viewport'); }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  };
  await play(); await color('green'); await within();
  assert.equal(await page.locator('.player-header').isVisible(),false);
  assert.equal(await page.locator('.player-toolbar').isVisible(),false);
  const aDefault=await box('a'); const shoulder=await box('l'); const dpadDefault=await box('dpad'); assert(shoulder.y+shoulder.height<dpadDefault.y,'Shoulders sit above the D-pad');
  await page.screenshot({path:out+'/mobile-controls-portrait.png'});
  // Real touch input into the pinned mGBA core, including independent fingers and D-pad sliding.
  const cdp=await context.newCDPSession(page); const point=async (name,id)=>{const r=await page.getByRole('button',{name,exact:true}).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2,id};};
  const a=await point('A button',1), up=await point('Up',2), right=await point('Right',2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,up]}); await color('red'); await dpad('up',true);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[a,right]}); await dpad('right',true); await dpad('up',false);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[right]}); await dpad('right',false); await color('red');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); await color('green');
  await menu(); await page.screenshot({path:out+'/mobile-game-drawer.png'});
  const panel=await page.locator('.player-bottom-chrome').boundingBox(); assert(panel.x>0&&panel.x+panel.width<=390&&panel.y<100);
  await page.getByRole('combobox',{name:'Playback speed'}).click(); await page.getByRole('option',{name:'2×',exact:true}).click();
  await page.getByRole('button',{name:'Edit controls',exact:true}).click();
  assert.equal(await page.locator('.player-shell').getAttribute('data-player-state'),'paused');
  await page.getByRole('combobox',{name:'Save controls for'}).click(); await page.getByRole('option',{name:'All games',exact:true}).click();
  const current=await box('a'); await page.mouse.move(current.x+current.width/2,current.y+current.height/2); await page.mouse.down(); await page.mouse.move(210,630,{steps:15}); await page.mouse.up();
  assert((await box('a')).x<aDefault.x-30);
  const size=page.getByRole('slider',{name:'Control size',exact:true}); await size.focus(); await page.keyboard.press('End'); assert.equal(await size.inputValue(),'1.8'); await within();
  const opacity=page.getByRole('slider',{name:'Control opacity'}); await opacity.focus(); await page.keyboard.press('Home'); for(let i=0;i<7;i++)await page.keyboard.press('ArrowRight');
  await page.screenshot({path:out+'/mobile-control-editor.png'});
  await page.getByRole('button',{name:'Done',exact:true}).click(); await color('green');
  let settings=await page.evaluate(async()=>(await import('/src/lib/library.ts')).getSettings());
  assert.equal(settings.touchLayouts.portrait.a.scale,1.8); assert.equal(settings.touchOpacity,.55); const saved=structuredClone(settings.touchLayouts);
  // Cancel discards edits and reset affects only the orientation being edited.
  await edit(); await page.getByRole('button',{name:'Reset layout'}).click(); await page.getByRole('button',{name:'Cancel control changes'}).click();
  assert(Math.abs((await box('a')).width-58*1.8)<.1);
  await edit(); await page.setViewportSize({width:844,height:390}); await page.waitForFunction(()=>document.querySelector('.touch-editor-heading small')?.textContent==='landscape');
  await page.getByRole('combobox',{name:'Control to resize'}).click(); await page.getByRole('option',{name:'L',exact:true}).click(); await size.focus(); await page.keyboard.press('End');
  await page.getByRole('button',{name:'Hide panel to move controls'}).click();
  await page.getByRole('button',{name:'Show size & opacity'}).click(); await page.getByRole('combobox',{name:'Save controls for'}).click(); await page.getByRole('option',{name:'All games',exact:true}).click(); await page.getByRole('button',{name:'Hide panel to move controls'}).click();
  const l=await box('l'); await page.mouse.move(l.x+l.width/2,l.y+l.height/2); await page.mouse.down(); await page.mouse.move(220,130,{steps:10}); await page.mouse.up(); await within();
  await page.getByRole('button',{name:'Done',exact:true}).click(); await color('green');
  settings=await page.evaluate(async()=>(await import('/src/lib/library.ts')).getSettings()); assert.deepEqual(settings.touchLayouts.portrait,saved.portrait); assert.equal(settings.touchLayouts.landscape.l.scale,1.8);
  await page.screenshot({path:out+'/mobile-controls-landscape.png'});
  await menu(); await page.getByRole('button',{name:'Save and return to library',exact:true}).click(); await page.locator('.player-shell').waitFor({state:'detached'});
  await page.reload(); await page.setViewportSize({width:320,height:720}); await play(); await color('green'); await within();
  assert(Math.abs((await box('a')).width-58*1.8)<.1); await menu();
  for(const control of await page.locator('.player-bottom-chrome .player-control').all()){const r=await control.boundingBox(); assert(r.x>=0&&r.x+r.width<=320.1);}
  await page.screenshot({path:out+'/mobile-game-drawer-320.png'});
  await page.locator('.player-toolbar').getByRole('button',{name:'Saves',exact:true}).click(); await page.getByRole('dialog',{name:'Checkpoints',exact:true}).waitFor(); await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  assert.deepEqual(errors,[]);
  await writeFile(out+'/mobile-controls-report.json',JSON.stringify({version:'0.4.0',status:'passed',checks:['real touch multi-input','D-pad slide/release/cancel','mobile-only sliding menu','editor pauses/resumes','move and size controls','opacity','cancel/reset','separate orientations','rotation bounds','disk persistence','320px drawer','checkpoint dialog'],errors},null,2));
  console.log('Mobile controller editor, drawer, persistence, rotation and real-core multitouch passed');
} catch(error){await page.screenshot({path:out+'/mobile-controls-failure.png'}).catch(()=>{});throw error;} finally{await browser.close();}
