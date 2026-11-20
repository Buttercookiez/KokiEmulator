import { _android as android } from 'playwright';
import { zipSync } from 'fflate';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const cube=await fs.readFile(process.env.KOKI_PSP_DEMO);
const archive=zipSync({'Cube/Cube.elf':cube,'Second/Second.elf':new Uint8Array(Buffer.concat([cube,Buffer.from([0])]))});
const device=(await android.devices()).find(item=>item.serial()==='emulator-5560');
device.setDefaultTimeout(20000);
let page;
try {
  await device.push(archive,'/sdcard/Download/Koki-test.zip');
  await device.shell('am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/Koki-test.zip');
  page=await (await device.webView({pkg:'com.koki.psp'})).page();
  page.setDefaultTimeout(30000);
  await page.waitForFunction(()=>!!window.kokiPsp);
  await page.evaluate(()=>window.kokiPsp.stop());
  await device.shell('settings put system accelerometer_rotation 0');
  await device.shell('settings put system user_rotation 0');
  await page.reload();
  await page.waitForFunction(()=>!!window.kokiPsp);
  await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
  await page.waitForFunction(()=>innerHeight>innerWidth);
  const originalStates=await page.evaluate(()=>window.kokiPsp.checkpoints());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if (!(await page.evaluate(()=>window.kokiPsp.games())).length) {
  await page.getByRole('button',{name:'Add games',exact:true}).click();
  await device.tap({desc:'Show roots'});
  await page.waitForTimeout(700);
  await device.tap({text:'Downloads',exact:true});
  await page.waitForTimeout(700);
  await device.tap({text:'Koki-test.zip',exact:true});
  }
  await page.getByRole('button',{name:'Play Cube',exact:true}).waitFor();
  const games=await page.evaluate(()=>window.kokiPsp.games());
  assert.equal(games.length,2);
  await page.getByRole('button',{name:'Play Cube',exact:true}).click();
  await page.getByRole('button',{name:'Player menu',exact:true}).waitFor();
  await page.waitForFunction(()=>innerWidth>innerHeight);
  await page.evaluate(()=>{
    const capacitor=window.Capacitor;
    const native=capacitor.nativePromise.bind(capacitor);
    window.testPspInputs=[];
    capacitor.nativePromise=(plugin,method,options)=>{
      if(plugin==='NativePsp'&&method==='input')window.testPspInputs.push(options);
      return native(plugin,method,options);
    };
  });
  await device.tap({text:'Got it'}, {timeout:2500}).catch(()=>{});
  await page.waitForTimeout(2500);
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Close player menu',exact:true}).click();
  const directory=path.join(root,'.cache/psp-tests');await fs.mkdir(directory,{recursive:true});
  const stick=await page.locator('[data-psp-control="stick"]').boundingBox();
  const dpad=await page.locator('[data-psp-control="dpad"]').boundingBox();
  const cross=await page.locator('[data-psp-control="cross"]').boundingBox();
  const center=(box)=>({x:box.x+box.width/2,y:box.y+box.height/2});
  assert.ok(dpad.y+dpad.height<stick.y,'D-pad and analog stick have separate touch areas');

  const stickCenter=center(stick);
  await page.mouse.move(stickCenter.x,stickCenter.y);
  await page.mouse.down();
  await page.mouse.move(stickCenter.x+stick.width/2,stickCenter.y-stick.height/3,{steps:4});
  await page.waitForFunction(()=>window.testPspInputs.some(({x,y})=>x>20000&&y<-10000));
  assert.ok(await page.locator('[data-psp-control="stick"] > span').evaluate(node=>new DOMMatrix(getComputedStyle(node).transform).m41>0));
  await page.mouse.up();
  await page.waitForFunction(()=>window.testPspInputs.at(-1)?.x===0&&window.testPspInputs.at(-1)?.y===0);
  for(const [selector,mask] of [['.up',16],['.down',32],['.left',64],['.right',128]]) {
    const direction=center(await page.locator('[data-psp-control="dpad"] '+selector).boundingBox());
    await page.mouse.click(direction.x,direction.y);
    await page.waitForFunction(bit=>window.testPspInputs.some(input=>input.buttons===bit),mask);
  }
  await page.mouse.click(cross.x+cross.width/2,cross.y+cross.height/2);
  await page.waitForFunction(()=>window.testPspInputs.some(input=>input.buttons===1)&&window.testPspInputs.at(-1)?.buttons===0);
  await page.evaluate(()=>{window.testPspInputs.length=0;});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.testPspInputs.length),0,'Idle frames should not call the input bridge');
  await fs.writeFile(path.join(directory,'android-landscape-game.png'),await device.screenshot());
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();
  await page.getByRole('button',{name:'Close player menu',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Checkpoint saved'}).waitFor({timeout:60000});
  const checkpoints=await page.evaluate(()=>window.kokiPsp.checkpoints());
  assert.equal(checkpoints.length,originalStates.length+1);
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Return to library',exact:true}).last().click();
  await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
  await page.waitForFunction(()=>innerHeight>innerWidth);
  await fs.writeFile(path.join(directory,'android-library.png'),await device.screenshot());
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await page.getByRole('button',{name:'Player menu',exact:true}).waitFor();
  await page.waitForFunction(()=>innerWidth>innerHeight);
  await page.waitForTimeout(500);
  await fs.writeFile(path.join(directory,'android-landscape-game.png'),await device.screenshot());
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Edit controls',exact:true}).click();
  const control=await page.locator('[data-psp-control="cross"]').boundingBox();
  await page.mouse.move(control.x+control.width/2,control.y+control.height/2);
  await page.mouse.down();
  await page.mouse.move(control.x+control.width/2-15,control.y+control.height/2-10,{steps:5});
  await page.mouse.up();
  await page.getByRole('button',{name:'Save for all games',exact:true}).click();
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Return to library',exact:true}).last().click();
  await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
  await page.getByRole('button',{name:'Play Second',exact:true}).click();
  await page.getByRole('button',{name:'Player menu',exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('koki-psp-settings')).layout.landscape));
  await page.getByRole('button',{name:'Player menu',exact:true}).click();
  await page.getByRole('button',{name:'Return to library',exact:true}).last().click();
  await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
  await page.locator('.mobile-nav').getByRole('button',{name:'Settings',exact:true}).click();
  for(const name of ['Display','Play your way','Keyboard & controller','Touch controls','Your data, on your device']){
    await page.getByRole('heading',{name,exact:true}).waitFor();
  }
  const filter=page.getByRole('combobox',{name:'Screen filter'});
  await filter.click();
  await page.getByRole('option',{name:'Crisp pixels'}).click();
  await page.getByRole('checkbox',{name:'On-screen controls'}).uncheck();
  assert.equal(await page.getByRole('slider',{name:'Default volume'}).inputValue(),'0.8');
  assert.equal(await page.getByRole('slider',{name:'Touch button opacity'}).inputValue(),'0.7');
  const preferences=await page.evaluate(()=>JSON.parse(localStorage.getItem('koki-psp-settings')));
  assert.equal(preferences.smoothing,false);
  assert.equal(preferences.showControls,false);
  assert.ok(preferences.layout.landscape);
  await page.getByRole('checkbox',{name:'Reduced motion'}).check();
  await page.waitForFunction(()=>document.documentElement.dataset.reducedMotion==='true');
  await fs.writeFile(path.join(directory,'android-settings.png'),await device.screenshot());
  assert.deepEqual(errors,[]);
  console.log('Passed Android system ZIP import, native GLES/JIT playback, checkpoint save/restore, screenshots, automatic landscape, touch input, shared controls and Settings.');
} catch(error) {
  if(page)console.log('Android page',await page.locator('body').innerText().catch(()=>''));
  console.log('Android log',String(await device.shell('logcat -d -s KokiPSP:E AndroidRuntime:E Capacitor/Console:E')).slice(-8000));
  throw error;
} finally { await device.shell('am force-stop com.koki.psp'); await device.close(); }
// End this CLI after the Android driver closes its test connection.
process.exit(0);
