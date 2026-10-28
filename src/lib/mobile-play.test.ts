import { describe, it, expect } from 'vitest';
import { dpadDirections, normalizeScreen, normalizeTurbo, turboMask } from './mobile-play';
import { touchPreset, TOUCH_GROUPS, touchRect } from './touch-layout';
import { DEFAULT_SETTINGS } from '../types';
import { gameSettings, normalizeGameProfile } from './profiles';
describe('mobile play', () => {
  it('supports eight D-pad directions with a neutral center and out-of-bounds release', () => {
    expect(dpadDirections(0, -.8)).toEqual(['up']); expect(dpadDirections(.8, -.8)).toEqual(['right','up']);
    expect(dpadDirections(-.8,.8)).toEqual(['left','down']); expect(dpadDirections(.1,.1)).toEqual([]);
    expect(dpadDirections(2,0)).toEqual([]); expect(dpadDirections(NaN,0)).toEqual([]);
    for(const x of [-1,0,1])for(const y of [-1,0,1]){const keys=dpadDirections(x,y); expect(keys.includes('left')&&keys.includes('right')).toBe(false); expect(keys.includes('up')&&keys.includes('down')).toBe(false);}
  });
  it('turbo gates held A/B without synthesizing keys or affecting directions', () => {
    const turbo={a:true,b:false,rate:8}; expect(turboMask(0,turbo,80)).toBe(0);
    expect(turboMask(0x43,turbo,0)).toBe(0x43); expect(turboMask(0x43,turbo,80)).toBe(0x42);
    expect(turboMask(0x43,{...turbo,b:true},80)).toBe(0x40); expect(turboMask(0x43,{a:false,b:false,rate:8},80)).toBe(0x43);
    expect(turboMask(1,turbo,130)).toBe(1);
  });
  it('normalizes unsafe mobile options and bounds screen/turbo settings', () => {
    expect(normalizeScreen({position:'stretch',scale:NaN})).toEqual({position:'center',scale:1});
    expect(normalizeScreen({position:'top',scale:0})).toEqual({position:'top',scale:.6});
    expect(normalizeTurbo({a:'yes',b:true,rate:100})).toEqual({a:false,b:true,rate:15});
  });
  it('offers mirrored, large and one-hand presets inside narrow/rotated screens', () => {
    expect(touchPreset('left').dpad.x).toBe(1); expect(touchPreset('left').a.x).toBe(0);
    expect(touchPreset('large').a.scale).toBeGreaterThan(1); expect(touchPreset('one').dpad.x).toBe(1);
    for(const preset of ['classic','left','large','one'])for(const [width,height] of [[288,632],[812,305]])for(const group of TOUCH_GROUPS){const r=touchRect(group,touchPreset(preset,width>height)[group],width,height);expect(r.left+r.width).toBeLessThanOrEqual(width+.01);expect(r.top+r.height).toBeLessThanOrEqual(height+.01);}
  });
  it('isolates per-game mobile settings, copies layouts and inherits globals when overrides are cleared', () => {
    const profile=normalizeGameProfile({touchLayouts:{portrait:touchPreset('left')},gameScreen:{position:'top',scale:.8},turbo:{a:true,rate:6},touchVibration:true})!;
    const custom=gameSettings(DEFAULT_SETTINGS,profile),other=gameSettings(DEFAULT_SETTINGS);
    expect(custom.touchLayouts.portrait.dpad.x).toBe(1); expect(other.touchLayouts.portrait.dpad.x).toBe(0);
    expect(custom.gameScreen.position).toBe('top'); expect(custom.turbo.a).toBe(true); expect(other.turbo.a).toBe(false);
    custom.touchLayouts.portrait.a.x=.4; expect(profile.touchLayouts!.portrait.a.x).toBe(0);
    expect(gameSettings(DEFAULT_SETTINGS,{...profile,touchLayouts:undefined,gameScreen:undefined}).gameScreen.position).toBe('center');
  });
});
