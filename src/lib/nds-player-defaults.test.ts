import { describe, expect, it, vi } from 'vitest';
vi.mock('../platform', async importOriginal => ({...await importOriginal<typeof import('../platform')>(), IS_NDS:true}));
const files = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('./storage', () => ({readFile:async (path:string)=>files.get(path)??null,writeFile:async(path:string,bytes:Uint8Array)=>{files.set(path,bytes);},removeFile:async()=>{},exportFile:async()=>{}}));
import { DEFAULT_SETTINGS } from '../types';
import { defaultTouchLayout, normalizeTouchLayouts } from './touch-layout';
import { legacyNdsTouchLayout, upgradeNdsPlayerDefaults, upgradeNdsLandscapeDefaults } from './nds-player-defaults';
describe('DS mobile defaults migration', () => {
 it('runs once and allows rewind to be re-enabled on a later launch', async () => {
  const old={...structuredClone(DEFAULT_SETTINGS),rewindSeconds:10,gameScreen:{scale:.7,position:'top'},touchLayouts:{portrait:legacyNdsTouchLayout(),landscape:legacyNdsTouchLayout(true)}};
  files.set('library.json',new TextEncoder().encode(JSON.stringify({version:1,games:[],snapshots:[],settings:old})));
  vi.resetModules();let lib=await import('./library');const settings=await lib.getSettings();expect(settings.rewindSeconds).toBe(0);
  await lib.saveSettings({...settings,rewindSeconds:10});
  vi.resetModules();lib=await import('./library');expect((await lib.getSettings()).rewindSeconds).toBe(10);
 });
 it('updates stock controls and old screen framing with rewind disabled', () => {
  const old = {...structuredClone(DEFAULT_SETTINGS), rewindSeconds:10, gameScreen:{scale:.7,position:'top' as const}, touchLayouts:{portrait:legacyNdsTouchLayout(),landscape:legacyNdsTouchLayout(true)}};
  const result=upgradeNdsPlayerDefaults(old);
  expect(result.touchLayouts.portrait).toEqual(defaultTouchLayout()); expect(result.touchLayouts.landscape).toEqual(defaultTouchLayout(true));
  expect(result.rewindSeconds).toBe(0); expect(result.gameScreen).toEqual({scale:1,position:'center'});
  expect(old.rewindSeconds).toBe(10);
 });
 it('preserves edited controls, custom framing and a custom rewind duration', () => {
  const old={...structuredClone(DEFAULT_SETTINGS),rewindSeconds:5,gameScreen:{scale:.8,position:'bottom' as const},touchLayouts:{portrait:legacyNdsTouchLayout(),landscape:legacyNdsTouchLayout(true)}};
  old.touchLayouts.landscape.a.x=.31;
  const result=upgradeNdsPlayerDefaults(old);
  expect(result.touchLayouts.landscape).toEqual(old.touchLayouts.landscape); expect(result.gameScreen).toEqual(old.gameScreen); expect(result.rewindSeconds).toBe(5);
 });
});

describe('compact DS landscape defaults',()=>{
 it('uses the compact scale for a fresh library',()=>{expect(normalizeTouchLayouts(undefined).landscape).toEqual(defaultTouchLayout(true));});
 function previous(){const p=(x:number,y:number)=>({x,y,scale:1});return {...structuredClone(DEFAULT_SETTINGS),touchLayouts:{portrait:defaultTouchLayout(),landscape:{dpad:p(0,.65),x:p(.955,.26),y:p(.91,.53),a:p(1,.53),b:p(.955,.80),l:p(0,.02),r:p(1,.02),select:p(.43,1),start:p(.57,1)}}};}
 it('upgrades only the untouched landscape preset and keeps portrait/framing',()=>{const old=previous(),next=upgradeNdsLandscapeDefaults(old);expect(next.touchLayouts.landscape).toEqual(defaultTouchLayout(true));expect(next.touchLayouts.portrait).toEqual(old.touchLayouts.portrait);expect(next.gameScreen).toEqual(old.gameScreen);});
 it('keeps moved or resized landscape controls',()=>{const old=previous();old.touchLayouts.landscape.x.scale=1.2;expect(upgradeNdsLandscapeDefaults(old)).toEqual(old);});
});
