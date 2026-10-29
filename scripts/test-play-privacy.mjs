import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const out='.cache/play-tests'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[];
try {
 for (const width of [320,1366]) {
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600});
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.KOKI_TEST_URL||'http://127.0.0.1:5184');
  await page.getByRole('button',{name:'Add your first game',exact:true}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await context.setOffline(true);
  await page.getByRole('button',{name:'Privacy policy',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Privacy policy',exact:true});
  await dialog.getByText('John Francis Marabe',{exact:true}).waitFor();
  assert(await dialog.getByText('johnfrancismarabe040905@gmail.com',{exact:true}).isVisible());
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Moving to Google Play',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Moving to Google Play',exact:true});
  assert(await dialog.getByRole('button',{name:'Export full backup',exact:true}).isVisible());
  assert(await dialog.getByRole('button',{name:'Restore backup',exact:true}).isVisible());
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'About Koki',exact:true}).click();
  await page.getByRole('button',{name:'Open-source licenses',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Open-source licenses',exact:true});
  assert.equal(await dialog.locator('details').count(),18);
  assert.equal(await dialog.locator('details[open]').count(),0);
  await dialog.getByRole('button',{name:'Close dialog',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY','License groups must be reachable with the keyboard');
  await page.keyboard.press('Enter');
  assert.equal(await dialog.locator('details[open]').count(),1);
  assert.match(await dialog.locator('details').first().innerText(),/Permission is hereby granted/);
  const inter=dialog.locator('details').filter({has:page.locator('summary').filter({hasText:'@fontsource-variable/inter'})});
  await inter.locator('summary').click();
  assert.match(await inter.innerText(),/SIL OPEN FONT LICENSE/i);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.screenshot({path:out+'/licenses-'+width+'.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(errors,[]);
  results.push({width,offlinePrivacy:'passed',migrationActions:'passed',offlineLicenses:'passed',collapsedGroups:18,keyboard:'passed',overflow:'none'});
  await context.close();
 }
 await writeFile(out+'/privacy-licenses-report.json',JSON.stringify({version:'0.4.4',status:'passed',results},null,2));
 console.log('Offline privacy, migration, license text, keyboard navigation and mobile/desktop layout passed.');
} finally {await browser.close();}
