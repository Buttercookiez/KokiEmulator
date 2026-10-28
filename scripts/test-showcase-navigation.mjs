import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.cache/site-tests-navigation');
const base=(process.env.KOKI_SITE_URL||'http://127.0.0.1:5190').replace(/\/$/,'');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const contexts=[],errors=[],checks=[],measurements=[];
let activePage;
function watch(page,label){
 page.setDefaultTimeout(10000);
 page.on('pageerror',error=>errors.push({label,message:error.message}));
 page.on('console',entry=>{if(entry.type()==='error')errors.push({label,message:entry.text()});});
}
async function context(options,label){const ctx=await browser.newContext(options);contexts.push(ctx);const page=await ctx.newPage();watch(page,label);return page;}
async function ready(page,route='/'){
 activePage=page;
 const response=await page.goto(base+route);assert.equal(response.status(),200,route+' loads');
 await page.locator('[data-loading-intro]').waitFor({state:'hidden',timeout:6000});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(250);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page fits viewport');
}
async function until(page,fn,message,timeout=5000){await page.waitForFunction(fn,null,{timeout});checks.push(message);}
async function box(page,selector){return page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});}
async function assertHeaderVisible(page,label){
 const outer=await box(page,'.site-header'),inner=await box(page,'.header-inner');
 assert(outer.top>=-1&&outer.top<=1,label+' sticky wrapper stays at top');
 assert(inner.top>=-1&&inner.bottom<=100,label+' navigation remains visible');
 assert(inner.x>=0&&inner.x+inner.width<=await page.evaluate(()=>innerWidth)+1,label+' header fits width');
 measurements.push({label,outer,inner});
}
async function assertSectionVisible(page,id){
 await page.waitForTimeout(1100);
 const section=await box(page,'#'+id),header=await box(page,'.header-inner');
 assert(section.top>=header.bottom-2,id+' is not obscured by sticky navigation');
 assert(section.top<await page.evaluate(()=>innerHeight),id+' reaches viewport');
 measurements.push({label:'anchor-'+id,sectionTop:section.top,headerBottom:header.bottom});
}
async function navOpen(page){
 await page.locator('.menu-toggle').click();
 await until(page,()=>document.querySelector('.menu-toggle')?.getAttribute('aria-expanded')==='true'&&!document.querySelector('#mobile-menu')?.hidden&&!document.querySelector('#mobile-menu')?.inert,'Mobile menu opens');
 await page.waitForTimeout(300);
 const menu=await box(page,'#mobile-menu');
 assert(menu.height>0&&menu.y>=0,'Open menu has usable geometry');
 assert(menu.x>=0&&menu.x+menu.width<=await page.evaluate(()=>innerWidth)+1,'Open menu fits viewport');
}
async function navClosed(page,label){
 await until(page,()=>document.querySelector('.menu-toggle')?.getAttribute('aria-expanded')==='false'&&document.querySelector('#mobile-menu')?.hidden,label);
}
try{
 const desktop=await context({viewport:{width:1440,height:1000},colorScheme:'dark'},'desktop');
 await ready(desktop);
 const download=desktop.locator('.header-download');
 assert.equal(await download.innerText(),'Downloads');assert.equal(await download.getAttribute('href'),'/gba/#downloads');
 assert.equal(await desktop.locator('.site-header').getByRole('link',{name:'Explore',exact:true}).count(),0,'Explore header action is removed');
 assert.equal(await desktop.locator('.site-header').evaluate(e=>getComputedStyle(e).position),'sticky');
 const initialMainTop=await desktop.locator('main').evaluate(e=>e.getBoundingClientRect().top+scrollY);
 await desktop.screenshot({path:path.join(output,'desktop-top.png')});
 await desktop.mouse.wheel(0,650);
 await until(desktop,()=>scrollY>400&&document.querySelector('.site-header')?.dataset.scrolled==='true','Scrolled navigation activates');
 await desktop.waitForTimeout(450);
 await assertHeaderVisible(desktop,'desktop-scrolled');
 assert.equal(await desktop.locator('main').evaluate(e=>e.getBoundingClientRect().top+scrollY),initialMainTop,'Header transition does not shift document flow');
 await desktop.screenshot({path:path.join(output,'desktop-scrolled.png')});
 for(const id of ['experience','faq','emulators']){
  await desktop.locator('.desktop-nav a[data-nav-section="'+id+'"]').click();
  await assertSectionVisible(desktop,id);
  await desktop.waitForFunction(id=>document.querySelector('.desktop-nav a[data-nav-section="'+id+'"]')?.getAttribute('aria-current')==='location',id,{timeout:5000});
  checks.push('Navigation identifies '+id+' as current');
 }
 const firstLink=desktop.locator('.desktop-nav a').first();await firstLink.focus();await desktop.keyboard.press('Tab');
 assert(await desktop.locator('.desktop-nav a').nth(1).evaluate(e=>e===document.activeElement),'Navigation remains keyboard navigable');
 assert(await desktop.locator('.desktop-nav a').nth(1).evaluate(e=>getComputedStyle(e).outlineStyle!=='none'),'Keyboard focus is visible');
 await desktop.locator('.header-download').click();await desktop.waitForURL(/\/gba\/#downloads$/);await desktop.locator('[data-loading-intro]').waitFor({state:'hidden'});await assertSectionVisible(desktop,'downloads');
 await assertHeaderVisible(desktop,'product-downloads');
 checks.push('Desktop sticky state, anchor offsets, keyboard and Downloads destination passed');

 for(const width of [390,320]){
  const mobile=await context({viewport:{width,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'},'mobile-'+width);await ready(mobile);
  const menuButton=await box(mobile,'.menu-toggle'),cta=await box(mobile,'.header-download');
  assert(menuButton.width>=44&&menuButton.height>=44,'Mobile navigation toggle has touch target');
  assert(cta.width>=44&&cta.height>=44,'Mobile downloads has touch target');
  const y=await mobile.evaluate(()=>scrollY),mainTop=await mobile.locator('main').evaluate(e=>e.getBoundingClientRect().top+scrollY);
  await navOpen(mobile);
  assert(Math.abs(await mobile.evaluate(()=>scrollY)-y)<2,'Opening menu preserves scroll position');
  assert.equal(await mobile.locator('main').evaluate(e=>e.getBoundingClientRect().top+scrollY),mainTop,'Opening menu does not push content');
  await mobile.screenshot({path:path.join(output,'mobile-'+width+'-menu.png')});
  await mobile.keyboard.press('Escape');await navClosed(mobile,'Escape closes navigation');
  assert(await mobile.locator('.menu-toggle').evaluate(e=>e===document.activeElement),'Escape restores toggle focus');
  await navOpen(mobile);
  const panel=await box(mobile,'#mobile-menu');const viewportHeight=await mobile.evaluate(()=>innerHeight);
  assert(panel.bottom+25<viewportHeight,'Menu leaves an outside area to dismiss');
  await mobile.mouse.click(12,Math.min(panel.bottom+30,viewportHeight-15));await navClosed(mobile,'Outside press closes navigation');
  await navOpen(mobile);await mobile.locator('#mobile-menu a[href="/#experience"]').click();await navClosed(mobile,'Section click closes navigation');await assertSectionVisible(mobile,'experience');await assertHeaderVisible(mobile,'mobile-'+width+'-scrolled');
  await mobile.screenshot({path:path.join(output,'mobile-'+width+'-scrolled.png')});
  await navOpen(mobile);await mobile.locator('.menu-toggle').click();await navClosed(mobile,'Toggle closes navigation');
  await navOpen(mobile);await mobile.setViewportSize({width:1000,height:844});await navClosed(mobile,'Desktop resize closes navigation');
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Resized navigation fits viewport');
  await mobile.setViewportSize({width,height:844});assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile navigation fits viewport after resize');
  checks.push('Mobile '+width+' touch, menu dismissal, offsets and resize passed');
 }
 const reduced=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark',reducedMotion:'reduce'},'reduced-motion');await ready(reduced);
 await navOpen(reduced);await reduced.locator('#mobile-menu a[href="/#faq"]').click();await navClosed(reduced,'Reduced-motion menu closes');await assertSectionVisible(reduced,'faq');await assertHeaderVisible(reduced,'reduced-motion');
 await reduced.screenshot({path:path.join(output,'reduced-motion.png')});checks.push('Reduced-motion navigation remains functional');
 assert.deepEqual(errors,[],'Navigation produces no script or console errors');
 const report={status:'passed',base,checks,measurements,errors};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){await activePage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,errors,checks,measurements},null,2)+'\n');throw error;}
finally{await Promise.all(contexts.map(ctx=>ctx.close()));await browser.close();}
