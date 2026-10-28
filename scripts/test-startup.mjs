import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,readdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,_electron} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist'),output=path.join(root,'.cache/startup-tests');
const splash='[data-startup-splash]',pieces='[data-startup-piece]';
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
await mkdir(output,{recursive:true});
const onlyWindows=process.argv.includes('--windows');
const includeWindows=onlyWindows||process.argv.includes('--all');
const reports=[];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm'};

function watch(page,errors){page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));}
async function completed(page){
 await page.waitForFunction(()=>document.documentElement.dataset.startup==='complete',{},{timeout:9000});
 await page.locator(splash).waitFor({state:'hidden'});
 assert(await page.locator('#root').evaluate(element=>!element.inert),'Startup releases library input');
 assert.notEqual(await page.locator('#root').getAttribute('aria-busy'),'true');
}
async function usable(page){await completed(page);await page.getByRole('button',{name:'Add your first game',exact:true}).waitFor({state:'visible'});}
async function seed(context,config={}){
 await context.addInitScript(options=>{
  const original=window.localStorage;
  if(!sessionStorage.getItem('startup-qa-seeded')){
   original.setItem('koki-startup-appearance',options.malformed?'not-json':JSON.stringify({theme:options.theme||'system',lightColor:options.lightColor||'monochrome',darkColor:options.darkColor||'monochrome'}));
   original.setItem('koki-reduced-motion',String(!!options.savedReduced));
   original.setItem('startup-qa-library',JSON.stringify({version:1,games:[],snapshots:[],settings:{theme:options.theme||'system',lightColor:options.lightColor||'monochrome',darkColor:options.darkColor||'monochrome'}}));
   sessionStorage.setItem('startup-qa-seeded','1');
  }
  window.__startupQa={events:0,completedAt:null,startedAt:performance.now()};
  document.addEventListener('koki:startup-complete',()=>{window.__startupQa.events++;window.__startupQa.completedAt=performance.now();});
  window.kokiNative={
   read:async file=>{await new Promise(resolve=>setTimeout(resolve,options.delay||0));if(options.reject)throw Error('Startup QA storage failure');return file==='library.json'?new TextEncoder().encode(original.getItem('startup-qa-library')):null;},
   write:async(file,bytes)=>{if(file==='library.json')original.setItem('startup-qa-library',new TextDecoder().decode(bytes));},
   remove:async()=>{},revealDataDirectory:async()=>{},exportFile:async()=>true,onBeforeClose:()=>()=>{}
  };
 },config);
}
async function web(){
 let server,browser;const contexts=[],results=[];
 try{
  let base=process.env.KOKI_STARTUP_URL;
  if(!base){server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(dist,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));assert(file.startsWith(dist+path.sep));const info=await stat(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});createReadStream(file).pipe(res);}catch{res.writeHead(404).end('Not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;}
  browser=await chromium.launch({channel:'msedge',headless:true});
  const scenario=async(name,options={},settings={})=>{const context=await browser.newContext({viewport:{width:options.mobile?390:1340,height:options.mobile?844:900},colorScheme:options.colorScheme||'light',reducedMotion:options.systemReduced?'reduce':'no-preference',isMobile:!!options.mobile,hasTouch:!!options.mobile});contexts.push(context);await seed(context,settings);const page=await context.newPage(),errors=[];watch(page,errors);return{context,page,errors,name};};
  const normal=await scenario('assembly-ready',{colorScheme:'dark'},{delay:1600});
  await normal.page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(await normal.page.locator(pieces).count(),3,'All three pieces assemble');
  assert(await normal.page.locator(splash).isVisible());
  assert(await normal.page.locator('#root').evaluate(element=>element.inert),'Library input is gated during startup');
  const assembly=await normal.page.locator(pieces).evaluateAll(elements=>elements.map(element=>getComputedStyle(element).animationName));
  assert(assembly.every(name=>name&&name!=='none'),'Ordinary startup animates each K piece');
  await normal.page.waitForTimeout(320);await normal.page.screenshot({path:path.join(output,'web-assembling.png')});
  assert(await normal.page.locator(splash).isVisible(),'A slow library does not disappear before readiness');
  await usable(normal.page);const first=await normal.page.evaluate(()=>window.__startupQa);
  assert(first.completedAt-first.startedAt>=1500,'Splash waits for local data');assert.equal(first.events,1);
  await normal.page.locator('.sidebar').getByRole('button',{name:'Favorites',exact:true}).click();await normal.page.getByRole('heading',{name:'Favorites',exact:true}).waitFor();
  await normal.page.getByRole('button',{name:'Customize colors',exact:true}).click();await normal.page.getByRole('heading',{name:'Colors',exact:true}).waitFor();
  await normal.page.locator('.sidebar').getByRole('button',{name:'Library',exact:true}).click();await normal.page.getByRole('heading',{name:'Your library',exact:true}).waitFor();
  assert.equal(await normal.page.locator(splash).count(),0,'Library navigation does not replay startup');assert.equal(await normal.page.evaluate(()=>window.__startupQa.events),1);
  await normal.page.reload({waitUntil:'domcontentloaded'});assert(await normal.page.locator(splash).isVisible(),'Refresh replays startup');assert.equal(await normal.page.locator(pieces).count(),3);await usable(normal.page);assert.equal(await normal.page.evaluate(()=>window.__startupQa.events),1);
  assert.deepEqual(normal.errors,[]);results.push({name:normal.name,status:'passed',assembly,readyMilliseconds:Math.round(first.completedAt-first.startedAt),reload:'passed',noRepeatOnNavigation:'passed'});
  for(const config of [
   {name:'cached-dark-violet',theme:'dark',darkColor:'#7c3aed',colorScheme:'light'},
   {name:'cached-light-ocean',theme:'light',lightColor:'#2563eb',colorScheme:'dark'},
   {name:'system-dark',theme:'system',colorScheme:'dark'},
   {name:'system-light',theme:'system',colorScheme:'light'},
   {name:'invalid-cache-fallback',malformed:true,theme:'system',colorScheme:'dark'}
  ]){
   const current=await scenario(config.name,config,{...config,delay:500});await current.page.goto(base,{waitUntil:'domcontentloaded'});await current.page.locator(splash).waitFor({state:'visible'});const before=await current.page.locator(splash).evaluate(element=>getComputedStyle(element).backgroundColor);await usable(current.page);const after=await current.page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor);assert.equal(before,after,config.name+' cached splash matches loaded appearance');assert.equal(await current.page.locator('html').getAttribute('data-theme'),config.theme==='system'?(config.colorScheme==='dark'?'dark':'light'):config.theme);assert.deepEqual(current.errors,[]);results.push({name:config.name,status:'passed',splashBackground:before,libraryBackground:after});
  }
  for(const config of [{name:'saved-reduced-motion',savedReduced:true},{name:'system-reduced-motion',systemReduced:true}]){
   const current=await scenario(config.name,{...config,mobile:true},{...config,delay:80});await current.page.goto(base,{waitUntil:'domcontentloaded'});const names=await current.page.locator(pieces).evaluateAll(elements=>elements.map(element=>getComputedStyle(element).animationName));assert(names.every(name=>name==='none'),'Reduced motion removes assembly');await usable(current.page);const timing=await current.page.evaluate(()=>window.__startupQa);assert(timing.completedAt-timing.startedAt<1050,'Reduced motion has no 1.1s decorative hold');assert.deepEqual(current.errors,[]);results.push({name:config.name,status:'passed',milliseconds:Math.round(timing.completedAt-timing.startedAt)});
  }
  const failure=await scenario('storage-error',{},{reject:true});await failure.page.goto(base);await usable(failure.page);await failure.page.getByText(/Local storage couldn’t be opened: Startup QA storage failure/).waitFor();assert.deepEqual(failure.errors,[]);results.push({name:failure.name,status:'passed',blockingSplash:'cleared',errorVisible:true});
  const slow=await scenario('bounded-slow-initialization',{},{delay:7200});await slow.page.goto(base,{waitUntil:'domcontentloaded'});await slow.page.locator(splash).waitFor({state:'hidden',timeout:7000});await slow.page.locator('[data-startup-recovery][data-banner="true"]').waitFor({state:'visible'});assert(await slow.page.locator('#root').evaluate(element=>!element.inert),'Deadline releases startup interaction');await usable(slow.page);await slow.page.locator('[data-startup-recovery]').waitFor({state:'hidden'});assert.deepEqual(slow.errors,[]);results.push({name:slow.name,status:'passed',deadlineRecovery:'passed',lateLibraryRecovery:'passed'});
  const assetDir=path.join(dist,'assets'),assets=await readdir(assetDir);const applicationChunks=[];
  for(const file of assets.filter(file=>file.endsWith('.js'))){const source=await readFile(path.join(assetDir,file),'utf8');if(source.includes('Add your first game')&&source.includes('Your library'))applicationChunks.push(file);}
  assert(applicationChunks.length,'Find emitted application module for import-failure test');
  const blocked=await scenario('app-import-error');await blocked.context.route('**/assets/*.js',route=>applicationChunks.some(file=>new URL(route.request().url()).pathname.endsWith('/'+file))?route.abort('failed'):route.continue());await blocked.page.goto(base,{waitUntil:'domcontentloaded'});await blocked.page.locator(splash).waitFor({state:'hidden',timeout:9000});await blocked.page.locator('[data-startup-recovery]').waitFor({state:'visible',timeout:2000});assert(await blocked.page.locator('#root').evaluate(element=>!element.inert));await blocked.page.screenshot({path:path.join(output,'web-recovery.png')});results.push({name:blocked.name,status:'passed',recovery:'visible',expectedNetworkFailure:true});
  const html=await readFile(path.join(dist,'index.html'),'utf8');const entries=[...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match=>new URL(match[1],base).pathname);assert(entries.length,'Find bootstrap module');const noBoot=await scenario('bootstrap-module-failure');await noBoot.context.route('**/assets/*.js',route=>entries.includes(new URL(route.request().url()).pathname)?route.abort('failed'):route.continue());await noBoot.page.goto(base,{waitUntil:'domcontentloaded'});await noBoot.page.locator('[data-startup-fallback]').waitFor({state:'visible',timeout:7500});assert(await noBoot.page.locator('#root').evaluate(element=>!element.inert),'Unavailable bootstrap never traps inert input');assert.equal(await noBoot.page.locator('[data-startup-fallback] a').getAttribute('href'),'./index.html');await noBoot.page.screenshot({path:path.join(output,'web-bootstrap-recovery.png')});results.push({name:noBoot.name,status:'passed',staticReloadLink:'visible',expectedNetworkFailure:true});
  const report={status:'passed',version,scope:'production browser startup, preferences, failure and reload',results};await writeFile(path.join(output,'browser.json'),JSON.stringify(report,null,2)+'\n');reports.push(report);console.log(JSON.stringify(report));
 }finally{await Promise.all(contexts.map(context=>context.close()));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
async function windows(){
 const executable=process.env.KOKI_STARTUP_WINDOWS_EXE||path.join(root,'release','win-unpacked',"Koki's Emulator.exe"),profile=path.join(output,'windows-profile-'+Date.now()),errors=[];let application;
 const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;delete environment.KOKI_DEV_URL;delete environment.KOKI_TEST_MODE;delete environment.KOKI_TEST_DATA_DIR;
 try{
  application=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile,'--no-first-run'],cwd:root,env:environment,timeout:30000});
  const page=await application.firstWindow();watch(page,errors);
  const native=await application.evaluate(({app})=>({packaged:app.isPackaged,userData:app.getPath('userData')}));assert(native.packaged,'Run actual packaged Windows app');assert.equal(path.resolve(native.userData).toLowerCase(),path.resolve(profile).toLowerCase(),'Windows test profile stays isolated');
  await usable(page);assert.equal(await page.evaluate(()=>typeof window.kokiNative.read),'function');
  await page.addInitScript(()=>{window.__startupQa={events:0,startedAt:performance.now(),completedAt:null};document.addEventListener('koki:startup-complete',()=>{window.__startupQa.events++;window.__startupQa.completedAt=performance.now();});});
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator(pieces).count(),3,'Windows reload renders assembling K');await page.waitForTimeout(320);await page.screenshot({path:path.join(output,'windows-assembling.png')});await usable(page);assert.equal(await page.evaluate(()=>window.__startupQa.events),1);
  await page.getByRole('button',{name:'Customize colors',exact:true}).click();await page.locator('.colors-layout .theme-switch').getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('radio',{name:'Violet',exact:true}).click();await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--bg')==='#15121a');await page.evaluate(()=>Promise.all(document.querySelector('.app').getAnimations().map(animation=>animation.finished.catch(()=>{}))));const background=await page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor);
  await page.reload({waitUntil:'domcontentloaded'});const splashBackground=await page.locator(splash).evaluate(element=>getComputedStyle(element).backgroundColor);assert.equal(splashBackground,background,'Packaged splash preserves chosen color');await usable(page);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Reduced motion',{exact:true}).check();await page.waitForFunction(()=>localStorage.getItem('koki-reduced-motion')==='true');await page.reload({waitUntil:'domcontentloaded'});await usable(page);const timing=await page.evaluate(()=>window.__startupQa);assert(timing.completedAt-timing.startedAt<1050,'Packaged reduced-motion preference avoids decorative hold');assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'windows-library.png')});const report={status:'passed',version,scope:'actual packaged Windows startup and reload',executable,asarSha256:createHash('sha256').update(await readFile(path.join(path.dirname(executable),'resources/app.asar'))).digest('hex'),native,isolatedProfile:profile,assemblingK:'passed',refresh:'passed',savedAppearance:'passed',reducedMotion:'passed',nativeBridge:'passed',pageErrors:errors};await writeFile(path.join(output,'windows.json'),JSON.stringify(report,null,2)+'\n');reports.push(report);console.log(JSON.stringify(report));
 }finally{if(application)await application.close();}
}
try{if(!onlyWindows)await web();if(includeWindows)await windows();await writeFile(path.join(output,'report.json'),JSON.stringify({status:'passed',version,reports},null,2)+'\n');}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({version,error:error.stack},null,2)+'\n');throw error;}
