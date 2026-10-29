// Native Android backend. SPDX-License-Identifier: GPL-3.0-or-later
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { EmulatorOptions } from './emulator';
import type { EmulatorButton } from '../types';
import { dsTouchPoint, type DsLayout } from './nds-emulator';
import { normalizeTurbo, type TurboSettings } from './mobile-play';
import { nativeFileUri, writeFile } from './storage';
export { NATIVE_NDS_ENGINE_ID } from '../platform';
export function nativeNdsAvailable(){return Capacitor.getPlatform?.()==='android' && Capacitor.isPluginAvailable?.('NativeNds')===true;}
type API={
 open(options:{gameId:string;rom:string;save?:string}):Promise<{engine:string;jit:boolean}>;
 viewport(options:{x:number;y:number;width:number;height:number;dpr:number}):Promise<void>;
 input(options:{keys:number;x:number;y:number;pen:boolean}):Promise<void>;
 configure(options:Record<string,number|boolean>):Promise<void>;
 play():Promise<void>;pause():Promise<void>;close():Promise<void>;reset():Promise<void>;
 battery():Promise<{bytes:number;uri?:string}>;checkpoint():Promise<{uri:string}>;restore(options:{uri:string}):Promise<void>;
 screenshot():Promise<{data:string}>;
 addListener(name:'stats'|'error',listener:(data:{fps:number;rewindSeconds:number;message:string})=>void):Promise<PluginListenerHandle>;
};
const bits:Record<EmulatorButton,number>={a:0,b:1,select:2,start:3,right:4,left:5,up:6,down:7,r:8,l:9,x:10,y:11};
let closing:Promise<unknown>=Promise.resolve();
export class NativeNdsEmulator {
 private api=registerPlugin<API>('NativeNds');
 private listeners:PluginListenerHandle[]=[];
 private initialized=false;private running=false;private dead=false;private mask=0;private padMask=0;private pen:number|null=null;private point:[number,number]|null=null;
 private layout:DsLayout='vertical';private swapped=false;private speed=1;private volume=.7;private rewind=0;private rewinding=false;private turbo=normalizeTurbo(undefined);
 private observer:ResizeObserver;private poll=0;private configTimer=0;
 constructor(private canvas:HTMLCanvasElement,private options:EmulatorOptions={},private gameId:string){
  canvas.width=256;canvas.height=384;canvas.style.touchAction='none';
  this.observer=new ResizeObserver(()=>this.viewport());this.observer.observe(canvas);
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'] as const)canvas.addEventListener(type,this.pointer);
  window.addEventListener('resize',this.viewport);window.addEventListener('blur',this.blur);
 }
 get loaded(){return this.initialized&&!this.dead;}get isRunning(){return this.running;}
 private report=(e:unknown)=>{if(!this.dead)this.options.onError?.(e instanceof Error?e:Error(String(e)));};
 private blur=()=>this.releaseButtons();
 async load(_rom:Uint8Array,save?:Uint8Array|null,state?:Uint8Array|null){
  await closing;if(this.dead)return;
  const rom=await nativeFileUri(`roms/${this.gameId}.nds`);let saveUri:string|undefined;
  // Native checkpoints contain cartridge save memory; an old-engine fallback must not block restoring one.
  if(save?.length&&!state?.length){await writeFile('native/transfer.sav',save);saveUri=await nativeFileUri('native/transfer.sav');}
  if(this.dead)return;
  const handles=await Promise.all([this.api.addListener('stats',s=>{if(!this.dead)this.options.onStats?.({fps:s.fps,rewindSeconds:s.rewindSeconds});}),this.api.addListener('error',s=>this.report(Error(s.message||'Native DS emulation stopped.')))]);
  if(this.dead){await Promise.all(handles.map(h=>h.remove()));return;}this.listeners.push(...handles);
  document.documentElement.dataset.nativeNds='true';
  await this.api.open({gameId:this.gameId,rom,save:saveUri});if(this.dead)return;this.initialized=true;
  this.setLayout(this.layout,this.swapped);await this.configure();if(state?.length)await this.loadState(state);this.viewport();
 }
 private configure(){if(!this.loaded)return Promise.resolve();return this.api.configure({layout:this.layout==='vertical'?0:this.layout==='horizontal'?1:2,swapped:this.swapped,speed:this.speed,volume:this.volume,rewind:this.rewind,rewinding:this.rewinding,turboA:this.turbo.a,turboB:this.turbo.b,turboRate:this.turbo.rate});}
 private queueConfig(){cancelAnimationFrame(this.configTimer);this.configTimer=requestAnimationFrame(()=>{void this.configure().catch(this.report);});}
 setLayout(layout:DsLayout,swapped=false){this.layout=layout;this.swapped=swapped;this.canvas.width=layout==='horizontal'?512:256;this.canvas.height=layout==='vertical'?384:192;this.queueConfig();this.viewport();}
 setTurbo(turbo:TurboSettings){this.turbo=normalizeTurbo(turbo);this.queueConfig();}
 setSpeed(speed:number){if(Number.isFinite(speed))this.speed=Math.max(.5,Math.min(4,speed));this.queueConfig();}
 setVolume(volume:number){this.volume=Math.max(0,Math.min(1,volume));this.queueConfig();}
 setRewindSeconds(seconds:number){this.rewind=Math.max(0,Math.min(20,seconds));this.queueConfig();}
 setRewinding(value:boolean){this.rewinding=value;this.queueConfig();}
 setButton(button:EmulatorButton,down:boolean){const bit=1<<bits[button];this.mask=down?this.mask|bit:this.mask&~bit;this.input();}
 releaseButtons(){this.mask=0;this.padMask=0;this.pen=null;this.point=null;this.input();}
 private input(){if(this.loaded)void this.api.input({keys:this.mask|this.padMask,x:this.point?.[0]??0,y:this.point?.[1]??0,pen:!!this.point}).catch(this.report);}
 private pads=()=>{if(!this.running||this.dead)return;const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected);let mask=0;if(pad){for(const [b,i]of Object.entries({a:0,b:1,x:2,y:3,l:4,r:5,select:8,start:9,up:12,down:13,left:14,right:15}))if(pad.buttons[i]?.pressed)mask|=1<<bits[b as EmulatorButton];if((pad.axes[0]??0)<-.4)mask|=32;if((pad.axes[0]??0)>.4)mask|=16;if((pad.axes[1]??0)<-.4)mask|=64;if((pad.axes[1]??0)>.4)mask|=128;}if(mask!==this.padMask){this.padMask=mask;this.input();}this.poll=requestAnimationFrame(this.pads);};
 play(){if(!this.loaded)throw Error('Load a DS game first.');this.running=true;void this.api.play().catch(this.report);cancelAnimationFrame(this.poll);this.poll=requestAnimationFrame(this.pads);}
 pause(){this.running=false;cancelAnimationFrame(this.poll);this.releaseButtons();if(this.loaded)void this.api.pause().catch(this.report);}
 async reset(){if(this.loaded)await this.api.reset();}
 private async fetch(uri:string){const response=await fetch(Capacitor.convertFileSrc(uri),{cache:'no-store'});if(!response.ok)throw Error('Could not read native game data.');return new Uint8Array(await response.arrayBuffer());}
 async exportSave(){if(!this.loaded)return null;const result=await this.api.battery();return result.bytes&&result.uri?this.fetch(result.uri):null;}
 async saveState(){if(!this.loaded)throw Error('The game is still loading.');const {uri}=await this.api.checkpoint();return this.fetch(uri);}
 async loadState(bytes:Uint8Array){await writeFile('native/transfer.state',bytes);await this.api.restore({uri:await nativeFileUri('native/transfer.state')});}
 async importSave(bytes:Uint8Array){await this.load(new Uint8Array(),bytes);}
 async screenshot(){const {data}=await this.api.screenshot();return new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'});}
 private viewport=()=>{if(!this.loaded)return;const r=this.canvas.getBoundingClientRect(),w=this.layout==='horizontal'?512:256,h=this.layout==='vertical'?384:192,scale=Math.min(r.width/w,r.height/h);const position=getComputedStyle(this.canvas).objectPosition;const align=/(?:top| 0%)$/.test(position)?0:/(?:bottom|100%)$/.test(position)?1:.5;void this.api.viewport({x:r.x+(r.width-w*scale)/2,y:r.y+(r.height-h*scale)*align,width:w*scale,height:h*scale,dpr:devicePixelRatio}).catch(this.report);};
 private pointer=(event:PointerEvent)=>{if(!this.loaded||!this.running)return;const end=['pointerup','pointercancel','lostpointercapture'].includes(event.type);if(this.pen!==null&&this.pen!==event.pointerId)return;if(event.type==='pointerdown'){this.pen=event.pointerId;this.canvas.setPointerCapture(event.pointerId);}if(event.type==='pointermove'&&!this.canvas.hasPointerCapture(event.pointerId))return;const r=this.canvas.getBoundingClientRect(),p=getComputedStyle(this.canvas).objectPosition;this.point=end?null:dsTouchPoint(event.clientX-r.left,event.clientY-r.top,r.width,r.height,this.layout,this.swapped,/(?:top| 0%)$/.test(p)?'top':/(?:bottom|100%)$/.test(p)?'bottom':'center');if(end)this.pen=null;this.input();if(this.point)event.preventDefault();};
 destroy(){if(this.dead)return;this.pause();this.dead=true;this.observer.disconnect();cancelAnimationFrame(this.configTimer);window.removeEventListener('resize',this.viewport);window.removeEventListener('blur',this.blur);for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'] as const)this.canvas.removeEventListener(type,this.pointer);for(const listener of this.listeners)void listener.remove();this.listeners=[];closing=this.api.close().catch(()=>{}).finally(()=>{if(!document.querySelector('[data-native-player="true"]'))delete document.documentElement.dataset.nativeNds;});this.initialized=false;delete document.documentElement.dataset.nativeNds;}
}
