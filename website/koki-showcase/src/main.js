(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introRemaining = Math.max(0, 1120 - (performance.now() - (window.__kokiIntroStart || 0)));
  if(document.documentElement.dataset.intro === 'pending') setTimeout(() => window.__kokiFinishIntro?.(), introRemaining);
  const field = $('[data-pointer-field]');
  if(field){
    const ctx = field.getContext('2d'), motionQuery = matchMedia('(prefers-reduced-motion: reduce)'), fineQuery = matchMedia('(pointer: fine)');
    let width=0,height=0,dpr=1,points=[],frame=0,remaining=0,interactive=false;
    const pointer={x:-1000,y:-1000};
    function render(){
      if(!ctx)return;
      ctx.clearRect(0,0,width,height);
      for(const point of points){
        const dx=point.x-pointer.x,dy=point.y-pointer.y,distance=Math.hypot(dx,dy),weight=interactive?Math.max(0,1-distance/175):0;
        const force=weight*weight*19,angle=Math.atan2(dy,dx),tx=Math.cos(angle)*force,ty=Math.sin(angle)*force;
        point.dx+=(tx-point.dx)*.16;point.dy+=(ty-point.dy)*.16;
        ctx.beginPath();ctx.arc(point.x+point.dx,point.y+point.dy,.75+weight*.55,0,Math.PI*2);
        ctx.fillStyle='rgba(219,219,225,'+(.13+weight*.42)+')';ctx.fill();
      }
      if(interactive&&remaining-- > 0&&!document.hidden)frame=requestAnimationFrame(render);else frame=0;
    }
    function requestRender(){if(!frame)frame=requestAnimationFrame(render);}
    function reset(){
      if(frame)cancelAnimationFrame(frame);frame=0;
      width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);
      field.width=Math.round(width*dpr);field.height=Math.round(height*dpr);
      if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);
      interactive=fineQuery.matches&&!motionQuery.matches;pointer.x=pointer.y=-1000;remaining=0;
      points=[];const gap=innerWidth<761?44:36;
      for(let y=22;y<height;y+=gap)for(let x=22;x<width;x+=gap)points.push({x,y,dx:0,dy:0});
      requestRender();
    }
    const move=event=>{if(!interactive||event.pointerType==='touch')return;pointer.x=event.clientX;pointer.y=event.clientY;remaining=55;requestRender();};
    const leave=()=>{if(!interactive)return;pointer.x=pointer.y=-1000;remaining=40;requestRender();};
    document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerleave',leave);
    addEventListener('blur',leave);addEventListener('resize',reset,{passive:true});
    motionQuery.addEventListener('change',reset);fineQuery.addEventListener('change',reset);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else reset();});
    addEventListener('pageshow',event=>{if(event.persisted)reset();});reset();
  }
  const gsap = window.gsap;
  if (gsap) gsap.registerPlugin(...[window.ScrollTrigger, window.ScrollToPlugin].filter(Boolean));
  let smoothScroll=null;
  const navButton = $('.menu-toggle'), mobileNav = $('#mobile-menu');
  const closeNav = () => { if (!navButton) return; navButton.setAttribute('aria-expanded', 'false'); navButton.setAttribute('aria-label','Open navigation'); mobileNav.hidden = true; document.body.style.overflow = ''; };
  navButton?.addEventListener('click', () => { const open = navButton.getAttribute('aria-expanded') !== 'true'; navButton.setAttribute('aria-expanded',String(open)); navButton.setAttribute('aria-label',open ? 'Close navigation' : 'Open navigation'); mobileNav.hidden = !open; document.body.style.overflow = open ? 'hidden' : ''; if (open && gsap && !reduced()) gsap.fromTo(mobileNav,{opacity:0,y:-8},{opacity:1,y:0,duration:.25,clearProps:'all'}); });
  addEventListener('resize', () => { if(innerWidth > 760) closeNav(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && navButton?.getAttribute('aria-expanded') === 'true') { closeNav(); navButton.focus(); } });
  $$('a[href]').forEach(link => link.addEventListener('click', event => {
    const url = new URL(link.href, location.href); if(url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
    let target; try { target = $(decodeURIComponent(url.hash)); } catch { return; } if (!target) return;
    event.preventDefault(); closeNav();
    if(smoothScroll) smoothScroll.to(target);
    else if(gsap && window.ScrollToPlugin && !reduced()) gsap.to(window,{duration:.8,scrollTo:{y:target,offsetY:24,autoKill:true},ease:'power3.inOut'});
    else { const top=target.getBoundingClientRect().top+scrollY-24; window.scrollTo({top,behavior:'instant'}); }
    history.replaceState(null,'',url.hash);
  }));
  const dialog = $('.coming-dialog');
  const plans = { color:{name:'Koki for Game Boy Color',art:'gameboy.svg',copy:'Game Boy Color support is planned. No release date yet.'}, ds:{name:'Koki for Nintendo DS',art:'dual-screen.svg',copy:'Nintendo DS support is planned. No release date yet.'}, psp:{name:'Koki for PlayStation Portable',art:'portable.svg',copy:'PSP support is planned. No release date yet.'} };
  $$('[data-coming]').forEach(button => button.addEventListener('click',()=>{const item=plans[button.dataset.coming];if(!item)return;$('#coming-title',dialog).textContent=item.name;$('.coming-copy',dialog).textContent=item.copy;$('.coming-art',dialog).src='/assets/'+item.art;dialog.showModal();smoothScroll?.pause();if(gsap&&!reduced())gsap.fromTo($('.dialog-inner',dialog),{opacity:0,y:12},{opacity:1,y:0,duration:.3,ease:'power2.out',clearProps:'all'});}));
  dialog?.addEventListener('close',()=>smoothScroll?.resume());
  $('.dialog-close')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $$('.copy-hash').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1800);}catch{button.textContent='Select';const code=button.parentElement.querySelector('code'),range=document.createRange();range.selectNodeContents(code);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}}));
  let downloading=false;
  const digest=async(bytes)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  $$('.download-windows').forEach(button=>button.addEventListener('click',async event=>{
    event.preventDefault();if(downloading)return;downloading=true;const wrap=button.closest('.download-card,.simple-download'),progress=$('.download-progress',wrap),status=$('.download-status',wrap),original=button.innerHTML;
    button.setAttribute('aria-busy','true');const feedback=$('.download-feedback',wrap);if(feedback)feedback.hidden=false;progress.hidden=false;progress.value=0;status.classList.remove('download-error');status.textContent='Preparing your Windows download…';button.textContent='Preparing… 0%';
    try{
      if(!crypto.subtle)throw Error('Use a browser with secure download verification.');
      const response=await fetch('/downloads/manifest.json',{cache:'no-store'});if(!response.ok)throw Error('The download is temporarily unavailable.');const {windows}=await response.json();
      const bytes=new Uint8Array(windows.bytes),offsets=[];let offset=0,done=0,cursor=0;for(const part of windows.parts){offsets.push(offset);offset+=part.bytes;}if(offset!==windows.bytes)throw Error('The download could not be verified.');
      async function worker(){while(cursor<windows.parts.length){const i=cursor++,part=windows.parts[i],r=await fetch(part.url);if(!r.ok)throw Error('The download was interrupted. Please try again.');const data=new Uint8Array(await r.arrayBuffer());if(data.length!==part.bytes||await digest(data)!==part.sha256)throw Error('The download could not be verified. Please try again.');bytes.set(data,offsets[i]);done+=data.length;const percent=Math.round(done/windows.bytes*100);progress.value=percent;button.textContent='Preparing… '+percent+'%';status.textContent=percent<100?'Preparing your download. You can keep this page open.':'Verifying your download…';}}
      await Promise.all(Array.from({length:Math.min(3,windows.parts.length)},worker));if(await digest(bytes)!==windows.sha256)throw Error('The download could not be verified. Please try again.');
      const blob=new Blob([bytes],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=windows.file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Download ready. Check your downloads.';
    }catch(error){status.classList.add('download-error');status.textContent=error.message||'Download failed. Please try again.';}finally{downloading=false;button.innerHTML=original;button.removeAttribute('aria-busy');progress.hidden=true;}
  }));
  if(!gsap||!window.ScrollTrigger)return;
  window.__kokiGsap=gsap.version;
  const mm=gsap.matchMedia();
  mm.add({desktop:'(min-width: 761px)',mobile:'(max-width: 760px)',reduce:'(prefers-reduced-motion: reduce)'},context=>{
    if(context.conditions.reduce)return;
    let scrollingCleanup=()=>{},magnetCleanup=()=>{};
    if(context.conditions.desktop&&matchMedia('(pointer: fine)').matches){
      if(window.Lenis){
        const lenis=new window.Lenis({autoRaf:true,lerp:.12,smoothWheel:true,syncTouch:false,anchors:false,respectReducedMotion:true,prevent:node=>Boolean(node.closest?.('dialog,[data-native-scroll],textarea,select,[contenteditable]'))});
        const ease=value=>1-Math.pow(1-value,4);
        let source='native',settleTimer=0;
        const cancelSettle=()=>{clearTimeout(settleTimer);settleTimer=0;};
        const interrupt=()=>{cancelSettle();source='native';lenis.scrollTo(window.scrollY,{immediate:true,force:true});};
        const settle=()=>{
          cancelSettle();
          if(source!=='wheel'||document.querySelector('dialog[open]')||getSelection()?.toString())return;
          source='native';
          const points=$$('main>section[id],main>.gba-features,main>.how-to').map(section=>Math.max(0,Math.min(lenis.limit,section.getBoundingClientRect().top+window.scrollY-24)));
          const nearest=points.reduce((best,value)=>Math.abs(value-window.scrollY)<Math.abs(best-window.scrollY)?value:best,Infinity);
          const gap=Math.abs(nearest-window.scrollY);
          if(gap>2&&gap<=42)lenis.scrollTo(nearest,{lerp:0,duration:.32,easing:ease});
        };
        const offScroll=lenis.on('scroll',instance=>{
          window.ScrollTrigger.update();
          if(instance.isScrolling==='native'){cancelSettle();source='native';}
          else if(source==='wheel'){cancelSettle();settleTimer=setTimeout(settle,170);}
        });
        const offVirtual=lenis.on('virtual-scroll',({event,deltaY})=>{
          cancelSettle();
          source=event.type==='wheel'&&!event.ctrlKey&&!event.metaKey&&deltaY!==0?'wheel':'native';
        });
        const key=event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Tab'].includes(event.key)||event.ctrlKey||event.metaKey)interrupt();};
        const resize=()=>{cancelSettle();lenis.resize();};
        document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',interrupt,{passive:true});document.addEventListener('touchstart',interrupt,{passive:true});addEventListener('resize',resize,{passive:true});
        smoothScroll={
          to:target=>{cancelSettle();source='anchor';lenis.resize();lenis.scrollTo(target,{offset:-24,lerp:0,duration:.85,easing:ease});},
          pause:()=>{interrupt();lenis.stop();},
          resume:()=>{if(!document.querySelector('dialog[open]')){lenis.start();lenis.resize();interrupt();}},
          resize
        };
        scrollingCleanup=()=>{cancelSettle();offScroll();offVirtual();document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',interrupt);document.removeEventListener('touchstart',interrupt);removeEventListener('resize',resize);lenis.destroy();smoothScroll=null;};
      }
      const buttons=$$('.hero-actions .button:not([disabled]),.header-actions .button:not([disabled]),.download-card a.button,.simple-download a.button');
      const releases=[];
      buttons.forEach(button=>{
        button.setAttribute('data-magnetic','');
        const x=gsap.quickTo(button,'x',{duration:.4,ease:'power3.out'}),y=gsap.quickTo(button,'y',{duration:.4,ease:'power3.out'});
        const reset=()=>{x(0);y(0);};
        const move=event=>{if(event.pointerType==='touch'||button.getAttribute('aria-busy')==='true')return;const rect=button.getBoundingClientRect(),baseX=rect.left-Number(gsap.getProperty(button,'x')),baseY=rect.top-Number(gsap.getProperty(button,'y'));x(gsap.utils.clamp(-5.5,5.5,(event.clientX-baseX-rect.width/2)*.11));y(gsap.utils.clamp(-4.5,4.5,(event.clientY-baseY-rect.height/2)*.14));};
        button.addEventListener('pointermove',move,{passive:true});button.addEventListener('pointerleave',reset);button.addEventListener('pointercancel',reset);button.addEventListener('focus',reset);button.addEventListener('pointerdown',reset);addEventListener('blur',reset);
        releases.push(()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerleave',reset);button.removeEventListener('pointercancel',reset);button.removeEventListener('focus',reset);button.removeEventListener('pointerdown',reset);removeEventListener('blur',reset);button.removeAttribute('data-magnetic');});
      });
      magnetCleanup=()=>releases.forEach(release=>release());
    }
    const hero=$('.hero-copy');
    if(hero){const items=[$('.release-chip',hero),$('h1',hero),$('.hero-description',hero),$('.hero-actions',hero),$('.hero-note',hero),$('.version-line',hero)].filter(Boolean);
      gsap.from(items,{y:12,opacity:0,duration:.65,stagger:.07,ease:'power2.out',delay:document.documentElement.dataset.intro==='pending'?introRemaining/1000:0,clearProps:'all'});
    }
    $$('.reveal').forEach(element=>gsap.from(element,{y:16,opacity:0,duration:.6,ease:'power2.out',scrollTrigger:{trigger:element,start:'top 94%',once:true}}));
    let deviceCleanup=()=>{};
    const stage=$('.device-stage'),model=$('[data-device-model]');
    if(stage&&model){
      gsap.from(model,{y:18,opacity:0,duration:.9,ease:'power2.out',delay:document.documentElement.dataset.intro==='pending'?introRemaining/1000+.08:.08,clearProps:'all'});
      if(context.conditions.desktop&&matchMedia('(pointer: fine)').matches){
        const rx=gsap.quickTo(model,'rotationX',{duration:.7,ease:'power2.out'}),ry=gsap.quickTo(model,'rotationY',{duration:.7,ease:'power2.out'});
        const move=event=>{const rect=stage.getBoundingClientRect();rx(-((event.clientY-rect.top)/rect.height-.5)*5);ry(((event.clientX-rect.left)/rect.width-.5)*7);};
        const leave=()=>{rx(0);ry(0);};
        stage.addEventListener('pointermove',move);stage.addEventListener('pointerleave',leave);
        deviceCleanup=()=>{stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',leave);};
      }
    }
    let collectionCleanup=()=>{};
    const collection=$('[data-collection-art]'),mark=$('[data-collection-mark]'),collectionHero=$('.collection-hero');
    if(collection&&mark&&collectionHero&&context.conditions.desktop){
      gsap.from(collection,{opacity:0,duration:.85,ease:'power2.out',delay:document.documentElement.dataset.intro==='pending'?introRemaining/1000+.1:.1,clearProps:'opacity'});
      if(matchMedia('(pointer: fine)').matches){
        const light=$('[data-collection-light]',mark);
        const smooth={duration:.8,ease:'power3.out'};
        const x=gsap.quickTo(mark,'x',smooth),y=gsap.quickTo(mark,'y',smooth),rotate=gsap.quickTo(mark,'rotation',smooth),rx=gsap.quickTo(mark,'rotationX',smooth),ry=gsap.quickTo(mark,'rotationY',smooth),scale=gsap.quickTo(mark,'scale',smooth),opacity=gsap.quickTo(mark,'opacity',{duration:.45,ease:'power2.out'});
        const clamp=gsap.utils.clamp(-.5,.5);
        const move=event=>{if(event.pointerType==='touch')return;const rect=collectionHero.getBoundingClientRect(),px=clamp((event.clientX-rect.left)/rect.width-.5),py=clamp((event.clientY-rect.top)/rect.height-.5);x(px*26);y(py*18);rotate(px*3);rx(-py*20);ry(px*30);scale(1.025);opacity(.66);if(light)gsap.to(light,{'--light-x':(50+px*70)+'%','--light-y':(45+py*70)+'%',opacity:.6,duration:.7,ease:'power3.out',overwrite:true});};
        const leave=()=>{x(0);y(0);rotate(0);rx(0);ry(0);scale(1);opacity(.55);if(light)gsap.to(light,{'--light-x':'50%','--light-y':'45%',opacity:0,duration:.8,ease:'power3.out',overwrite:true});};
        collectionHero.addEventListener('pointermove',move,{passive:true});collectionHero.addEventListener('pointerleave',leave);collectionHero.addEventListener('pointercancel',leave);addEventListener('blur',leave);
        collectionCleanup=()=>{collectionHero.removeEventListener('pointermove',move);collectionHero.removeEventListener('pointerleave',leave);collectionHero.removeEventListener('pointercancel',leave);removeEventListener('blur',leave);};
      }
    }
    return ()=>{deviceCleanup();collectionCleanup();magnetCleanup();scrollingCleanup();};
  });
  document.fonts?.ready.then(()=>{smoothScroll?.resize();window.ScrollTrigger.refresh();});
  addEventListener('pagehide',event=>{if(event.persisted){smoothScroll?.pause();return;}mm.revert();});
  addEventListener('pageshow',event=>{if(event.persisted){smoothScroll?.resume();window.ScrollTrigger.refresh();}});
})();
