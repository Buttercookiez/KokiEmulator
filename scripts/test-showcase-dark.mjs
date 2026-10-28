import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.KOKI_SITE_URL || 'http://127.0.0.1:5190';
const backgroundSelector = process.env.KOKI_BACKGROUND_SELECTOR || '[data-site-background]';
const introSelector = process.env.KOKI_INTRO_SELECTOR || '[data-loading-intro]';
const heroGraphicSelector = '[data-collection-art]';
const output = '.cache/site-tests-dark';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [], contexts = [], contrast = [];
const graphicMeasurements={};
const inputMeasurements={};
const headingPages=new Set();
function monitor(page, collectConsole=true) {
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  if(collectConsole) page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
}
async function introGone(page, timeout=5000) {
  const intro=page.locator(introSelector);
  if(await intro.count()) await intro.waitFor({state:'hidden',timeout});
  await checkHeadingPunctuation(page);
  assert(!await page.locator('main').evaluate(e=>e.inert||e.getAttribute('aria-hidden')==='true'),'Intro must release main content');
}
async function ready(page, path = '/') {
  await page.goto(base + path);
  await introGone(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1250);
}
async function noOverflow(page, label) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ' must fit the viewport');
}
async function colors(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const rgba = color => {const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
    const over=(fg,bg)=>[fg[0]*fg[3]+bg[0]*(1-fg[3]),fg[1]*fg[3]+bg[1]*(1-fg[3]),fg[2]*fg[3]+bg[2]*(1-fg[3]),1];
    const chain=[];for(let current=element;current;current=current.parentElement)chain.push(current);
    let background=[0,0,0,1];for(const ancestor of chain.reverse())background=over(rgba(getComputedStyle(ancestor).backgroundColor),background);
    const style=getComputedStyle(element);let opacity=1;for(const ancestor of chain)opacity*=Number(getComputedStyle(ancestor).opacity);const raw=rgba(style.color);raw[3]*=opacity;const foreground=over(raw,background);
    const luminance=color=>color.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);const bg=luminance(background),fg=luminance(foreground);
    return{text:element.textContent.trim().slice(0,80),foreground:style.color,background,ratio:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05),font:style.fontSize,effectiveOpacity:opacity};
  });
}
async function contrastCheck(page, selector, threshold = 4.5) {
  const element=page.locator(selector).first();
  if(!await element.count()||!await element.isVisible()){contrast.push({selector,skipped:'Omitted or hidden in the minimalist layout'});return;}
  await element.scrollIntoViewIfNeeded();await page.waitForTimeout(850);const sample=await colors(page,selector);contrast.push({selector,...sample});assert(sample.ratio>=threshold,selector+' contrast '+sample.ratio.toFixed(2)+' is below '+threshold);
}
async function canvas(page) {
  const root=page.locator(backgroundSelector).first();
  if(await root.evaluate(e=>e.tagName==='CANVAS'))return root;
  return root.locator('canvas').first();
}
async function effectiveGraphicOpacity(page) {
  return page.locator('[data-collection-mark] img').evaluate(element=>{let opacity=1;for(let current=element;current;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);return opacity;});
}
async function markTransform(page) {
  return page.locator('[data-collection-mark]').evaluate(element=>{const matrix=new DOMMatrix(getComputedStyle(element).transform);return{x:matrix.m41,y:matrix.m42,tiltX:matrix.m23,tiltY:matrix.m13,matrix:[...matrix.toFloat64Array()]};});
}
async function graphicLightState(page) {
  return page.locator('[data-collection-light]').evaluate(element=>{const style=getComputedStyle(element);return{opacity:Number(style.opacity),x:parseFloat(style.getPropertyValue('--light-x')),y:parseFloat(style.getPropertyValue('--light-y'))};});
}
async function checkHeroGraphic(page, selector, {requiredVisible=false,reduced=false}={}) {
  const graphic=page.locator(selector);assert.equal(await graphic.count(),1,'Homepage should contain one collection graphic');
  assert.equal(await graphic.getAttribute('aria-hidden'),'true','Collection graphic is decorative');
  assert.equal(await graphic.evaluate(e=>getComputedStyle(e).pointerEvents),'none','Collection graphic must not intercept clicks');
  assert.equal(await graphic.locator('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').count(),0,'Decorative graphic must not add keyboard stops');
  const visible=await graphic.isVisible();if(requiredVisible)assert(visible,'Desktop hero should display the collection graphic');
  if(visible){const box=await graphic.boundingBox(),width=page.viewportSize().width;assert(box.x>=-.5&&box.x+box.width<=width+.5,'Collection graphic should fit the viewport');}
  if(reduced){assert(!await graphic.evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.playState==='running')),'Reduced-motion graphic should have no running animations');const sample=()=>graphic.evaluate(e=>[e,...e.querySelectorAll('*')].map(node=>getComputedStyle(node).transform));const before=await sample();await page.waitForTimeout(450);assert.deepEqual(await sample(),before,'Reduced-motion graphic should remain static');}
  return visible?'visible':'hidden by responsive layout';
}
async function checkIntroAssembly(page, pieceSelector) {
  const pieces=page.locator(pieceSelector);assert(await pieces.count()>=3,'The K loader should contain distinct assembling pieces');
  const state=()=>pieces.evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{transform:style.transform,opacity:style.opacity,clip:style.clipPath,dash:style.strokeDashoffset,filter:style.filter,fill:style.fill};}));
  const before=await state();await page.waitForTimeout(150);const after=await state();assert.notDeepEqual(after,before,'The K pieces should visibly assemble during entry');
  assert(await page.locator(introSelector).isVisible(),'The assembling K should remain visible during its brief entry');
}
async function installInputRecorder(page) {
  await page.evaluate(()=>{
    window.__qaInputs={wheel:[],keys:[],touch:[]};if(window.__qaInputInstalled)return;window.__qaInputInstalled=true;
    addEventListener('wheel',event=>setTimeout(()=>window.__qaInputs.wheel.push({prevented:event.defaultPrevented,dy:event.deltaY}),0),{passive:true});
    addEventListener('keydown',event=>setTimeout(()=>window.__qaInputs.keys.push({prevented:event.defaultPrevented,key:event.key}),0));
    addEventListener('touchmove',event=>setTimeout(()=>window.__qaInputs.touch.push({prevented:event.defaultPrevented}),0),{passive:true});
  });
}
async function checkMagnet(page, button, moving=button, {disabled=false,maxOffset=6,screenshotPath}={}) {
  const transform=()=>moving.evaluate(element=>{const m=new DOMMatrix(getComputedStyle(element).transform);return{x:m.m41,y:m.m42};});
  const box=await button.boundingBox(),before=await transform();
  await page.mouse.move(box.x+box.width*.83,box.y+box.height*.25,{steps:8});await page.waitForTimeout(500);const peak=await transform();
  const dx=peak.x-before.x,dy=peak.y-before.y;
  if(disabled)assert(Math.hypot(dx,dy)<.05,'Reduced/coarse-pointer buttons must not move magnetically');
  else{assert(Math.hypot(dx,dy)>.4,'Button should respond to a nearby pointer');assert(Math.abs(dx)<=maxOffset+.5&&Math.abs(dy)<=maxOffset+.5,'Magnetic movement should remain restrained');}
  assert(await button.evaluate((element,point)=>document.elementFromPoint(point.x,point.y)?.closest('a,button')===element,{x:box.x+box.width/2,y:box.y+box.height/2}),'Magnetic button must preserve its original center click target');
  await noOverflow(page,'Magnetic button state');if(screenshotPath)await page.screenshot({path:screenshotPath});
  await page.mouse.move(8,8,{steps:6});await page.waitForTimeout(650);const reset=await transform();assert(Math.hypot(reset.x-before.x,reset.y-before.y)<.1,'Magnetic button should reset after pointer exit');
  return{dx,dy,disabled};
}
async function checkSmoothWheel(page) {
  await installInputRecorder(page);await page.mouse.move(page.viewportSize().width*.55,page.viewportSize().height*.6);
  await page.evaluate(()=>{window.scrollTo({top:0,behavior:'instant'});window.__qaWheelFrames=[];const start=performance.now();const record=()=>{window.__qaWheelFrames.push({t:performance.now()-start,y:scrollY});if(performance.now()-start<1100)requestAnimationFrame(record);};requestAnimationFrame(record);});
  await page.mouse.wheel(0,480);await page.waitForTimeout(1150);
  const result=await page.evaluate(()=>({frames:window.__qaWheelFrames,wheel:window.__qaInputs.wheel.at(-1),y:scrollY}));
  assert.equal(result.wheel.prevented,true,'Fine-pointer wheel input should be handled by smooth scrolling');
  const moving=result.frames.filter(frame=>frame.y>.1&&frame.y<479.9),positions=new Set(moving.map(frame=>Math.round(frame.y*10)/10));
  assert(positions.size>=5,'Real wheel input should pass through multiple intermediate scroll positions');assert(Math.abs(result.y-480)<3,'Wheel smoothing should land at the requested distance');
  await page.mouse.wheel(0,240);await page.waitForTimeout(70);await page.keyboard.press('Home');await page.waitForTimeout(700);assert(await page.evaluate(()=>scrollY<2),'Home should interrupt wheel smoothing and remain at the top');
  await page.keyboard.press('PageDown');await page.waitForTimeout(450);assert(await page.evaluate(()=>scrollY>300),'PageDown should retain native page scrolling');assert.equal(await page.evaluate(()=>window.__qaInputs.keys.findLast(event=>event.key==='PageDown').prevented),false);
  await page.keyboard.press('Home');await page.waitForTimeout(450);assert(await page.evaluate(()=>scrollY<2));
  return{intermediatePositions:positions.size,distance:result.y};
}
async function checkNativeWheel(page) {
  await installInputRecorder(page);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.mouse.move(page.viewportSize().width*.55,page.viewportSize().height*.6);await page.mouse.wheel(0,420);await page.waitForTimeout(250);
  const state=await page.evaluate(()=>({wheel:window.__qaInputs.wheel.at(-1),y:scrollY}));assert.equal(state.wheel.prevented,false,'Reduced/coarse-pointer wheel should remain native');assert(state.y>350,'Native wheel input should scroll without a delayed tween');await page.keyboard.press('Home');await page.waitForTimeout(350);return state.y;
}
async function checkNativeTouch(page, context) {
  await installInputRecorder(page);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  const session=await context.newCDPSession(page),viewport=page.viewportSize(),x=Math.round(viewport.width*.84),start=Math.round(viewport.height*.78),end=Math.round(viewport.height*.33);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start,id:1}]});
  for(let step=1;step<=9;step++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(start+(end-start)*step/9),id:1}]});await page.waitForTimeout(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);await session.detach();
  const state=await page.evaluate(()=>({y:scrollY,touches:window.__qaInputs.touch}));assert(state.y>120,'A real touch swipe should scroll the page');assert(state.touches.length>0&&state.touches.every(event=>!event.prevented),'Touch scrolling should remain native');await noOverflow(page,'Touch-scrolled page');return{distance:state.y,events:state.touches.length};
}
async function newContext(options={}){const context=await browser.newContext(options);contexts.push(context);return context;}
function cleanHeading(value){return value.replace(/\s+/g,' ').trim().replace(/[.。．]+$/u,'').trim();}
async function checkHeadingPunctuation(page){const headings=await page.locator('h1,h2,h3,h4,h5,h6').allTextContents();const bad=headings.map(text=>text.replace(/\s+/g,' ').trim()).filter(text=>/[.。．]$/u.test(text));assert.deepEqual(bad,[],'Headings should not end with a period on '+new URL(page.url()).pathname);headingPages.add(new URL(page.url()).pathname);}
try {
  // A fresh page and every full reload must show the intro, including existing sessions.
  const introContext=await newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const introPage=await introContext.newPage();monitor(introPage);
  await introPage.addInitScript(selector=>{
    addEventListener('DOMContentLoaded',()=>{
      const intro=document.querySelector(selector),style=intro&&getComputedStyle(intro);
      window.__qaIntroAtDomReady=!!intro&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;
    },{once:true});
  },introSelector);
  await introPage.goto(base,{waitUntil:'domcontentloaded'});
  assert(await introPage.evaluate(()=>window.__qaIntroAtDomReady),'A first visit must display the loading intro');
  const intro=introPage.locator(introSelector);
  assert.equal(await intro.getAttribute('aria-hidden'),'true');
  assert.equal(await intro.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await intro.locator('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])').count(),0,'Decorative intro must not contain keyboard stops');
  await introPage.screenshot({path:output+'/intro-initial-desktop.png'});assert.equal(await intro.locator('.intro-track,img').count(),0,'The loading screen should use the assembling K rather than the old wordmark/bar');await checkIntroAssembly(introPage,'[data-intro-piece]');await introPage.screenshot({path:output+'/intro-desktop.png'});
  await introPage.keyboard.press('Tab');
  assert(await introPage.evaluate(selector=>!document.activeElement?.closest(selector)&&document.activeElement!==document.body,introSelector),'Keyboard focus must reach the website while the intro is visible');
  await introGone(introPage);
  await introPage.evaluate(()=>sessionStorage.setItem('koki-intro-seen','true'));
  await introPage.reload({waitUntil:'domcontentloaded'});
  assert(await introPage.evaluate(()=>window.__qaIntroAtDomReady),'A full refresh must replay the intro even in a previously visited session');
  await introPage.screenshot({path:output+'/intro-reload-desktop.png'});await checkIntroAssembly(introPage,'[data-intro-piece]');await introPage.screenshot({path:output+'/intro-mid-desktop.png'});await introPage.waitForTimeout(800);await introPage.screenshot({path:output+'/intro-assembled-desktop.png'});
  await introGone(introPage);await introPage.reload({waitUntil:'domcontentloaded'});assert(await introPage.evaluate(()=>window.__qaIntroAtDomReady));await introPage.mouse.wheel(0,120);await introGone(introPage,1000);
  await introPage.locator('.skip-link').focus();await introPage.keyboard.press('Tab');
  assert(await introPage.evaluate(selector=>!document.activeElement?.closest(selector)&&document.activeElement!==document.body,introSelector),'Keyboard focus must reach the website after the intro');
  const desktop=await newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const page=await desktop.newPage();monitor(page);await ready(page);await noOverflow(page,'Desktop');
  assert.equal(cleanHeading(await page.locator('h1').innerText()),'Koki Emulators');
  assert.equal(await page.locator('.hero [data-device-model]').count(),0,'Homepage must introduce the collection rather than the GBA product');
  assert.equal(await page.locator('.hero').getByRole('link',{name:/Download/}).count(),0);
  assert.equal(await page.locator('.hero').getByRole('link',{name:'Explore emulators',exact:true}).getAttribute('href'),'#emulators');
  assert.equal(await page.locator('.site-header .header-actions a[href="/#emulators"]').count(),1,'Home header should lead to the collection');
  await checkHeroGraphic(page,heroGraphicSelector,{requiredVisible:true});assert(await page.locator('[data-collection-mark] img').evaluate(e=>e.complete&&e.naturalWidth>0),'Collection graphic artwork should load');
  const markBefore=await page.locator('[data-collection-mark]').evaluate(e=>getComputedStyle(e).transform);
  const restOpacity=await effectiveGraphicOpacity(page);assert(Math.abs(restOpacity-.55)<.025,'Collection artwork should have reduced resting opacity');assert.equal((await graphicLightState(page)).opacity,0);
  const rootColor=await colors(page,'h1');assert(rootColor.background.slice(0,3).every(x=>x<70),'The hero should use a dark background');
  await contrastCheck(page,'h1',3);await contrastCheck(page,'.hero-description');await contrastCheck(page,'.hero-note');await page.screenshot({path:output+'/home-desktop.png'});
  const background=page.locator(backgroundSelector).first();await background.waitFor({state:'attached'});
  assert.equal(await background.evaluate(e=>getComputedStyle(e).pointerEvents),'none');assert.equal(await background.getAttribute('aria-hidden'),'true');
  const desktopCanvas=await canvas(page);assert(await desktopCanvas.count(),'Minimal background should have a dot-grid canvas');
  const before=await desktopCanvas.evaluate(e=>e.toDataURL());await page.mouse.move(1010,380,{steps:8});await page.waitForTimeout(300);const after=await desktopCanvas.evaluate(e=>e.toDataURL());assert.notEqual(after,before,'Desktop dot grid should react to the pointer');assert.notEqual(await page.locator('[data-collection-mark]').evaluate(e=>getComputedStyle(e).transform),markBefore,'Collection artwork should react to the pointer');
  const heroBox=await page.locator('.collection-hero').boundingBox();
  await page.mouse.move(heroBox.x+heroBox.width*.12,heroBox.y+heroBox.height*.22,{steps:10});await page.waitForTimeout(700);const tiltA=await markTransform(page),lightA=await graphicLightState(page);
  await page.mouse.move(heroBox.x+heroBox.width*.86,heroBox.y+heroBox.height*.76,{steps:10});await page.waitForTimeout(700);const tiltB=await markTransform(page),lightB=await graphicLightState(page),activeOpacity=await effectiveGraphicOpacity(page);
  assert(Math.hypot(tiltB.x-tiltA.x,tiltB.y-tiltA.y)>5,'Opposing pointer positions should produce meaningful movement');
  assert(Math.hypot(tiltB.tiltX-tiltA.tiltX,tiltB.tiltY-tiltA.tiltY)>.05,'Pointer interaction should include a visible 3D tilt');
  assert(lightA.opacity>.5&&lightB.opacity>.5,'Pointer highlight should become visible');assert(Math.hypot(lightB.x-lightA.x,lightB.y-lightA.y)>15,'Lighting should follow opposing pointer positions');assert(Math.abs(activeOpacity-.66)<.03,'Active artwork should remain translucent');
  await page.screenshot({path:output+'/home-interactive.png'});
  await page.mouse.move(8,8,{steps:6});await page.waitForTimeout(1100);const resetTilt=await markTransform(page),resetLight=await graphicLightState(page);
  assert(Math.abs(resetTilt.x)<.3&&Math.abs(resetTilt.y)<.3&&Math.abs(resetTilt.tiltX)<.003&&Math.abs(resetTilt.tiltY)<.003,'Leaving the hero should return the artwork to its neutral pose');assert(resetLight.opacity<.02,'Leaving the hero should fade the highlight');assert(Math.abs(await effectiveGraphicOpacity(page)-.55)<.025);
  Object.assign(graphicMeasurements,{restOpacity,activeOpacity,lightA,lightB,translationDelta:Math.hypot(tiltB.x-tiltA.x,tiltB.y-tiltA.y),tiltDelta:Math.hypot(tiltB.tiltX-tiltA.tiltX,tiltB.tiltY-tiltA.tiltY),resetLightOpacity:resetLight.opacity});
  assert.equal(await background.locator('.night-scene').count(),0,'Forest scenery should be removed');
  await page.locator('.hero').getByRole('link',{name:'Explore emulators',exact:true}).click();await page.waitForTimeout(1000);const collectionBox=await page.locator('#emulators').boundingBox();assert(collectionBox.y>=0&&collectionBox.y<100);await page.screenshot({path:output+'/collection-desktop.png'});
  await contrastCheck(page,'.emulator-info h3',3);await contrastCheck(page,'.emulator-info p');
  const future=page.getByRole('button',{name:/Game Boy Color/});await future.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await contrastCheck(page,'.coming-copy');const modalY=await page.evaluate(()=>scrollY);await page.mouse.move(10,400);await page.mouse.wheel(0,200);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>scrollY),modalY,'An open dialog should pause background scrolling');await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert(await future.evaluate(e=>document.activeElement===e));const resumeBase=await page.evaluate(()=>scrollY);await page.mouse.move(720,600);await page.mouse.wheel(0,120);await page.waitForTimeout(1200);const resumeDelta=await page.evaluate(()=>scrollY)-resumeBase;assert(Math.abs(resumeDelta-120)<3,'Closing the dialog should resume smooth wheel scrolling');inputMeasurements.modalResumeDelta=resumeDelta;
  const features=page.locator('#experience');
  for(const name of ['Local first','Personal controls','Keep your progress']){const heading=features.getByRole('heading',{name,exact:true});assert(await heading.isVisible());assert((await heading.locator('..').locator('p').innerText()).trim().length>=20);}
  assert.equal(await features.locator('[role=tablist],[data-tab],.interface-preview,.demo-control').count(),0);
  await contrastCheck(page,'#experience h3');await contrastCheck(page,'#experience p');
  await features.scrollIntoViewIfNeeded();await page.waitForTimeout(600);await page.screenshot({path:output+'/feature-overview-desktop.png'});
  await ready(page,'/gba/');assert.equal(cleanHeading(await page.locator('h1').innerText()),'Koki GBA');const back=page.locator('.gba-hero').getByRole('link',{name:'All emulators',exact:true});assert.equal(await back.getAttribute('href'),'/#emulators');assert.equal(await back.locator('use').getAttribute('href'),'/assets/icons.svg#arrow-left');assert.equal(await page.locator('.ios-download .platform-icon use').getAttribute('href'),'/assets/icons.svg#apple');const sprite=await (await page.request.get(base+'/assets/icons.svg')).text();assert(await page.evaluate(source=>Boolean(new DOMParser().parseFromString(source,'image/svg+xml').querySelector('symbol#apple path')),sprite));const modelSource=await (await page.request.get(base+'/assets/graphite-handheld.svg')).text();assert(await page.evaluate(source=>{const svg=new DOMParser().parseFromString(source,'image/svg+xml');return!!svg.querySelector('#gh-select')&&!!svg.querySelector('#gh-start')&&!svg.querySelector('[id^=gh-shoulder]');},modelSource));assert(await page.locator('[data-device-model] img').evaluate(e=>e.complete&&e.naturalWidth>0&&!!e.alt),'The GBA product page should retain its handheld model');await page.screenshot({path:output+'/gba-desktop.png'});await page.locator('[data-device-model]').screenshot({path:output+'/handheld-detail.png'});await contrastCheck(page,'.download-card:not(.ios-download) h3',3);await contrastCheck(page,'.windows-download .download-platform>p');await contrastCheck(page,'.windows-download .download-meta');await contrastCheck(page,'.android-download .download-platform>p');await contrastCheck(page,'.ios-download .download-meta');await contrastCheck(page,'.download-notes>p');await contrastCheck(page,'.release-label');
  assert(await page.locator('.release-label').evaluate(e=>['Top','Right','Bottom','Left'].every(side=>parseFloat(getComputedStyle(e)['border'+side+'Width'])===0)),'Preview version should not have a border box');
  assert(await page.getByRole('button',{name:'Coming soon',exact:true}).isDisabled());await page.locator('#downloads').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.screenshot({path:output+'/downloads-desktop.png'});await page.locator('.ios-download').screenshot({path:output+'/ios-download-row.png'});
  await ready(page,'/credits/');await contrastCheck(page,'.simple-page>p');assert.equal((await page.request.get(base+'/assets/LENIS-LICENSE.txt')).status(),200);await ready(page,'/downloads/windows/');assert(await page.getByRole('link',{name:'Download for Windows',exact:true}).isVisible());await page.screenshot({path:output+'/windows-download-page.png'});
  const mediumContext=await newContext({viewport:{width:900,height:1000},colorScheme:'dark'});const medium=await mediumContext.newPage();monitor(medium);await ready(medium);await noOverflow(medium,'900px homepage');await checkHeroGraphic(medium,heroGraphicSelector,{requiredVisible:true});await medium.screenshot({path:output+'/home-900.png'});
  assert(await medium.evaluate(()=>document.documentElement.classList.contains('lenis')),'Fine desktop should enable smooth scrolling');
  await medium.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  const primaryMagnet=medium.locator('.hero-actions .button.primary'),headerMagnet=medium.locator('.header-actions .button');
  assert.equal(await primaryMagnet.getAttribute('data-magnetic'),'');assert.equal(await headerMagnet.getAttribute('data-magnetic'),'');
  inputMeasurements.primaryMagnet=await checkMagnet(medium,primaryMagnet,undefined,{screenshotPath:output+'/magnetic-button-desktop.png'});inputMeasurements.headerMagnet=await checkMagnet(medium,headerMagnet);inputMeasurements.smoothWheel=await checkSmoothWheel(medium);
  const clickBox=await primaryMagnet.boundingBox(),clickPoint={x:clickBox.x+clickBox.width*.83,y:clickBox.y+clickBox.height*.25};await medium.mouse.move(clickPoint.x,clickPoint.y,{steps:8});await medium.waitForTimeout(450);await medium.mouse.click(clickPoint.x,clickPoint.y);await medium.waitForTimeout(1100);let mediumCollection=await medium.locator('#emulators').boundingBox();assert(mediumCollection.y>=0&&mediumCollection.y<100,'Magnetic primary CTA should remain clickable');
  const anchorY=await medium.evaluate(()=>scrollY);await medium.mouse.move(480,600);await medium.mouse.wheel(0,120);await medium.waitForTimeout(1200);const anchorWheelY=await medium.evaluate(()=>scrollY);assert(Math.abs(anchorWheelY-anchorY-120)<3,'Wheel input after an anchor should continue from the current position');inputMeasurements.anchorWheelDelta=anchorWheelY-anchorY;
  await medium.keyboard.press('Home');await medium.waitForTimeout(450);await primaryMagnet.click();await medium.waitForTimeout(1100);const snapBase=await medium.evaluate(()=>scrollY);await medium.mouse.move(480,600);await medium.mouse.wheel(0,28);await medium.waitForTimeout(1800);const snapY=await medium.evaluate(()=>scrollY);assert(Math.abs(snapY-snapBase)<3,'A wheel stop within42px should settle gently to the section boundary');inputMeasurements.sectionSnapDrift=snapY-snapBase;await medium.screenshot({path:output+'/scroll-settled-desktop.png'});
  await medium.mouse.wheel(0,28);await medium.waitForTimeout(800);await medium.keyboard.press('Home');await medium.waitForTimeout(700);assert(await medium.evaluate(()=>scrollY<2),'Keyboard navigation should cancel pending section magnetism');
  const reducedDesktopContext=await newContext({viewport:{width:1440,height:1000},colorScheme:'dark',reducedMotion:'reduce'});const reducedDesktop=await reducedDesktopContext.newPage();monitor(reducedDesktop);await ready(reducedDesktop);await checkHeroGraphic(reducedDesktop,heroGraphicSelector,{requiredVisible:true,reduced:true});const reducedTilt=await markTransform(reducedDesktop),reducedLight=await graphicLightState(reducedDesktop);const reducedHero=await reducedDesktop.locator('.collection-hero').boundingBox();await reducedDesktop.mouse.move(reducedHero.x+reducedHero.width*.86,reducedHero.y+reducedHero.height*.76,{steps:10});await reducedDesktop.waitForTimeout(700);assert.deepEqual(await markTransform(reducedDesktop),reducedTilt,'Reduced-motion artwork must ignore pointer tilt');assert.deepEqual(await graphicLightState(reducedDesktop),reducedLight,'Reduced-motion lighting must remain static');assert.equal(reducedLight.opacity,0);assert(Math.abs(await effectiveGraphicOpacity(reducedDesktop)-.55)<.025);assert.equal(await reducedDesktop.locator('[data-magnetic]').count(),0);assert(!await reducedDesktop.evaluate(()=>document.documentElement.classList.contains('lenis')));inputMeasurements.reducedPrimary=await checkMagnet(reducedDesktop,reducedDesktop.locator('.hero-actions .button.primary'),undefined,{disabled:true});inputMeasurements.reducedHeader=await checkMagnet(reducedDesktop,reducedDesktop.locator('.header-actions .button'),undefined,{disabled:true});inputMeasurements.reducedNativeWheel=await checkNativeWheel(reducedDesktop);await reducedDesktop.screenshot({path:output+'/home-reduced-desktop.png'});
  for(const[width,height]of[[390,844],[320,720]]){
    const context=await newContext({viewport:{width,height},hasTouch:true,isMobile:true,colorScheme:'dark'});const mobile=await context.newPage();monitor(mobile);await ready(mobile);await noOverflow(mobile,width+'px home');await checkHeroGraphic(mobile,heroGraphicSelector);assert.equal(await mobile.locator(heroGraphicSelector).isVisible(),false,'Phone hero remains compact without decorative artwork');await mobile.screenshot({path:output+'/home-'+width+'.png'});
    const mobileCanvas=await canvas(mobile);const before=await mobileCanvas.evaluate(e=>e.toDataURL());await mobile.mouse.move(200,200);await mobile.waitForTimeout(300);assert.equal(await mobileCanvas.evaluate(e=>e.toDataURL()),before,'Phone dot grid remains static');
    if(width===390){assert(!await mobile.evaluate(()=>document.documentElement.classList.contains('lenis')));assert.equal(await mobile.locator('[data-magnetic]').count(),0);inputMeasurements.coarseMagnet=await checkMagnet(mobile,mobile.locator('.hero-actions .button.primary'),undefined,{disabled:true});inputMeasurements.coarseNativeWheel=await checkNativeWheel(mobile);inputMeasurements.nativeTouch=await checkNativeTouch(mobile,context);await mobile.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await mobile.waitForTimeout(100);}
    assert.equal(await mobile.locator('.hero [data-device-model]').count(),0);await mobile.locator('.hero').getByRole('link',{name:'Explore emulators',exact:true}).click();await mobile.waitForTimeout(1000);const box=await mobile.locator('#emulators').boundingBox();assert(box.y>=0&&box.y<100);await mobile.screenshot({path:output+'/collection-'+width+'.png'});
    await mobile.getByRole('button',{name:'Open navigation',exact:true}).click();assert(await mobile.getByRole('navigation',{name:'Mobile navigation'}).isVisible());await mobile.keyboard.press('Escape');assert.equal(await mobile.getByRole('navigation',{name:'Mobile navigation'}).isVisible(),false);assert.notEqual(await mobile.evaluate(()=>document.body.style.overflow),'hidden');
    await mobile.locator('#experience').scrollIntoViewIfNeeded();await mobile.waitForTimeout(850);assert.equal(await mobile.locator('.feature-overview-item').count(),3);await mobile.screenshot({path:output+'/feature-overview-'+width+'.png'});
    await ready(mobile,'/gba/');await noOverflow(mobile,width+'px GBA');await mobile.screenshot({path:output+'/gba-'+width+'.png'});await mobile.locator('#downloads').scrollIntoViewIfNeeded();await mobile.waitForTimeout(800);
    for(const button of await mobile.locator('.download-card .button').all()){const r=await button.boundingBox();assert(r.x>=0&&r.x+r.width<=width+.5&&r.height>=44);}
    await mobile.screenshot({path:output+'/downloads-'+width+'.png'});if(width===390)await mobile.locator('.ios-download').screenshot({path:output+'/ios-download-mobile.png'});
  }
  const reducedContext=await newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});const reduced=await reducedContext.newPage();monitor(reduced);await ready(reduced);assert.equal(await reduced.locator(introSelector).isVisible(),false);assert(!await reduced.locator(introSelector).evaluate(e=>e.getAnimations({subtree:true}).some(animation=>animation.playState==='running')));await checkHeroGraphic(reduced,heroGraphicSelector,{reduced:true});
  const state=await reduced.locator(backgroundSelector).first().evaluate(e=>({running:e.getAnimations({subtree:true}).some(a=>a.playState==='running')}));assert(!state.running);
  const reducedCanvas=await canvas(reduced);const still=await reducedCanvas.evaluate(e=>e.toDataURL());await reduced.mouse.move(180,280);await reduced.waitForTimeout(300);assert.equal(await reducedCanvas.evaluate(e=>e.toDataURL()),still,'Reduced-motion dot grid remains static');assert.equal(await reduced.locator('h1').evaluate(e=>getComputedStyle(e).opacity),'1');await reduced.screenshot({path:output+'/home-reduced.png'});
  // Disabled scripts must never strand a visitor behind the loading screen.
  const nojsContext=await newContext({viewport:{width:390,height:844},javaScriptEnabled:false,colorScheme:'dark'});const nojs=await nojsContext.newPage();monitor(nojs,false);await nojs.goto(base);await introGone(nojs);assert(await nojs.getByRole('heading',{level:1}).isVisible());await nojs.locator('a.gba-card').click();await nojs.waitForURL(base+'/gba/');await introGone(nojs);assert(await nojs.getByRole('link',{name:'Download for Android',exact:true}).isVisible());await nojs.screenshot({path:output+'/no-js-gba.png'});await nojs.locator('.gba-hero').getByRole('link',{name:'All emulators',exact:true}).click();await nojs.waitForURL(url=>url.pathname==='/'&&url.hash==='#emulators');await introGone(nojs);await nojs.screenshot({path:output+'/no-js-collection-return.png'});
  const blockedContext=await newContext({viewport:{width:390,height:844},colorScheme:'dark'});const blocked=await blockedContext.newPage();monitor(blocked,false);await blocked.route('**/assets/*.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:'/* External scripts deliberately unavailable for fail-open QA. */'}));await blocked.goto(base);await introGone(blocked);assert(await blocked.getByRole('heading',{level:1}).isVisible());await blocked.locator('a.gba-card').click();await blocked.waitForURL(base+'/gba/');await introGone(blocked);
  assert.deepEqual(errors,[]);
  const report={status:'passed',desktop1440:'passed',mobile390and320:'passed',decorativeCollectionArt:'passed',responsiveCollectionArt:'passed',reducedCollectionArt:'passed',interactiveCollectionArt:'passed',lowerCollectionOpacity:'passed',pointerLighting:'passed',pointerReset:'passed',graphicMeasurements,desktop900:'passed',smoothWheel:'passed',nativeKeyboard:'passed',nativeTouch:'passed',reducedNativeScroll:'passed',magneticButtons:'passed',anchorWheelContinuity:'passed',gentleSectionSnap:'passed',dialogScrollPause:'passed',dialogScrollResume:'passed',lenisLicense:'passed',browserCacheInputHooks:'passed',inputMeasurements,collectionHomepage:'passed',collectionExploreCTA:'passed',gbaProductModel:'passed',darkSurfaces:'passed',contrastSamples:contrast,introDismissal:'passed',introEveryRefresh:'passed',assemblingKLoader:'passed',loaderWheelSkip:'passed',headingsWithoutTrailingPeriods:'passed',headingPages:[...headingPages].sort(),appleIosIcon:'passed',emulatorBacklink:'passed',handheldSelectStart:'passed',introKeyboardAccess:'passed',noJavaScriptFailOpen:'passed',blockedExternalScriptsFailOpen:'passed',interactiveDesktopCanvas:'passed',staticPhoneAndReducedMotionCanvas:'passed',backgroundNonInteractive:'passed',dialogFocusAndEscape:'passed',featureDescriptions:'passed',unboxedReleaseLabel:'passed',mobileNavigation:'passed',downloadButtons:'passed',errors};await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){const pages=contexts.flatMap(c=>c.pages());await pages.at(-1)?.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
