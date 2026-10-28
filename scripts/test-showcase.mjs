import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output='.cache/site-tests';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const base='http://127.0.0.1:5190';
async function settleIntro(page){const intro=page.locator('[data-loading-intro]');if(await intro.count())await intro.waitFor({state:'hidden',timeout:5000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1250);await checkHeadingPunctuation(page);}
function cleanHeading(value){return value.replace(/\s+/g,' ').trim().replace(/[.。．]+$/u,'').trim();}
async function checkHeadingPunctuation(page){const headings=await page.locator('h1,h2,h3,h4,h5,h6').allTextContents();const bad=headings.map(text=>text.replace(/\s+/g,' ').trim()).filter(text=>/[.。．]$/u.test(text));assert.deepEqual(bad,[],'Headings should not end with a period on '+new URL(page.url()).pathname);}
try{
 await page.goto(base);await settleIntro(page);
 assert.equal(await page.evaluate(()=>window.__kokiGsap),'3.15.0');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop must not overflow horizontally');
 assert.equal(cleanHeading(await page.locator('h1').innerText()),'Koki Emulators');
 assert.equal(await page.locator('.hero [data-device-model]').count(),0,'Homepage hero introduces the emulator collection');
 assert.equal(await page.locator('.hero').getByRole('link',{name:/Download/}).count(),0,'Homepage hero should not send visitors straight to one product download');
 const collectionArt=page.locator('[data-collection-art]');assert.equal(await collectionArt.getAttribute('aria-hidden'),'true');assert.equal(await collectionArt.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 const explore=page.locator('.hero').getByRole('link',{name:'Explore emulators',exact:true});assert.equal(await explore.getAttribute('href'),'#emulators');
 await page.screenshot({path:output+'/home-desktop.png'});
 await explore.click();await page.waitForTimeout(1000);const collectionBox=await page.locator('#emulators').boundingBox();assert(collectionBox.y>=0&&collectionBox.y<100,'Homepage CTA should reveal the emulator collection');await page.screenshot({path:output+'/collection-desktop.png'});
 await page.getByRole('button',{name:/Game Boy Color/}).click();await page.getByRole('dialog').waitFor();await page.getByRole('heading',{name:'Koki for Game Boy Color'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);
 const features=page.locator('#experience');await features.scrollIntoViewIfNeeded();await page.waitForTimeout(700);
 for(const name of ['Local first','Personal controls','Keep your progress']){const heading=features.getByRole('heading',{name,exact:true});assert(await heading.isVisible());const row=heading.locator('..');assert((await row.locator('p').innerText()).trim().length>=20,name+' needs a useful description');}
 assert.equal(await features.locator('[role=tablist],[data-tab],.interface-preview,.demo-control').count(),0,'Feature section should be a simple list');
 await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 assert(await features.getByRole('heading',{name:'Personal controls',exact:true}).isVisible(),'Feature content remains visible after browser Back cache restoration');
 await page.screenshot({path:output+'/experience-desktop.png'});
 await page.goto(base+'/gba/');await settleIntro(page);assert.equal(cleanHeading(await page.locator('h1').innerText()),'Koki GBA');assert(await page.locator('[data-device-model] img').evaluate(e=>e.complete&&e.naturalWidth>0));await page.screenshot({path:output+'/gba-desktop.png'});
 await page.getByRole('link',{name:'Download Koki GBA',exact:true}).click();await page.waitForTimeout(1000);assert(await page.getByRole('link',{name:'Download for Windows',exact:true}).isVisible());assert(await page.getByRole('button',{name:/Coming soon/}).isDisabled());await page.screenshot({path:output+'/downloads-desktop.png'});
 const release=page.locator('.release-label');assert(await release.evaluate(e=>['Top','Right','Bottom','Left'].every(side=>parseFloat(getComputedStyle(e)['border'+side+'Width'])===0)),'Preview version label should have no border box');
 const manifest=await (await page.request.get(base+'/downloads/manifest.json')).json();
 const apkPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download for Android',exact:true}).click();const apk=await apkPromise;const apkBytes=await readFile(await apk.path());assert.equal(createHash('sha256').update(apkBytes).digest('hex'),manifest.android.sha256);
 const winPromise=page.waitForEvent('download',{timeout:90000});await page.getByRole('link',{name:'Download for Windows',exact:true}).click();const win=await winPromise;const winBytes=await readFile(await win.path());assert.equal(createHash('sha256').update(winBytes).digest('hex'),manifest.windows.sha256);assert.equal(win.suggestedFilename(),manifest.windows.file);
 await page.goto(base+'/credits/');await settleIntro(page);await page.getByRole('heading',{name:/^Credits$/}).waitFor();assert.equal((await page.request.get(base+'/assets/GSAP-LICENSE.txt')).status(),200);
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await settleIntro(mobile);await mobile.screenshot({path:output+'/home-mobile.png'});
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px page must not overflow');await mobile.getByRole('button',{name:'Open navigation',exact:true}).click();assert(await mobile.getByRole('navigation',{name:'Mobile navigation'}).isVisible());await mobile.keyboard.press('Escape');assert.equal(await mobile.getByRole('navigation',{name:'Mobile navigation'}).isVisible(),false);
 await mobile.setViewportSize({width:320,height:720});await mobile.goto(base+'/gba/');await settleIntro(mobile);assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px product page must not overflow');await mobile.locator('#downloads').scrollIntoViewIfNeeded();await mobile.waitForTimeout(600);await mobile.screenshot({path:output+'/downloads-mobile.png'});
 for(const link of await mobile.locator('.download-card .button').all()){const r=await link.boundingBox();assert(r.width<=280&&r.height>=44);}
 await mobile.emulateMedia({reducedMotion:'reduce'});await mobile.goto(base);await settleIntro(mobile);assert(await mobile.locator('h1').evaluate(e=>getComputedStyle(e).opacity==='1'));assert.equal(await mobile.locator('.hero [data-device-model]').count(),0);await mobile.screenshot({path:output+'/home-reduced-mobile.png'});await mobile.goto(base+'/gba/');await settleIntro(mobile);assert(await mobile.locator('[data-device-model]').evaluate(e=>getComputedStyle(e).transform==='none'&&getComputedStyle(e).opacity==='1'));await mobile.screenshot({path:output+'/gba-reduced-mobile.png'});
 assert.deepEqual(errors,[]);const report={status:'passed',gsap:'3.15.0',desktop1440:'passed',mobile390and320:'passed',collectionHomepage:'passed',collectionExploreCTA:'passed',futureSystemDialogs:'passed',featureDescriptions:'passed',browserBackCache:'passed',keyboardNavigation:'passed',gbaDeepLink:'passed',windowsDownloadSha256:manifest.windows.sha256,androidDownloadSha256:manifest.android.sha256,iosDisabled:'passed',reducedMotion:'passed',errors};await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
