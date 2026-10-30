import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8 } from 'fflate';
import { DEFAULT_SETTINGS } from '../types';
import { defaultTouchLayout, normalizeTouchLayouts, touchRect, TOUCH_GROUPS } from './touch-layout';
const memory = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('./storage', () => ({ readFile: async (name: string) => memory.get(name)?.slice() ?? null, writeFile: async (name: string, bytes: Uint8Array) => { memory.set(name, bytes.slice()); }, removeFile: async (name: string) => { memory.delete(name); }, exportFile: async () => undefined }));
beforeEach(() => { memory.clear(); vi.resetModules(); });
describe('touch layouts', () => {
  it('applies shared controls to every game, clears old overrides and keeps other profile settings after reload', async () => {
    const oldLayouts = normalizeTouchLayouts(undefined);
    oldLayouts.landscape.a.x = .2;
    memory.set('library.json', strToU8(JSON.stringify({version:1, settings:DEFAULT_SETTINGS, snapshots:[], games:[
      {id:'first', profile:{touchLayouts:oldLayouts, touchOpacity:.3, speed:2}},
      {id:'second', profile:{touchLayouts:oldLayouts, gameScreen:{scale:.7,position:'top'}, turbo:{a:true}, touchVibration:true, filter:'smooth'}},
    ]})));
    let lib = await import('./library');
    const shared = normalizeTouchLayouts(undefined);
    shared.portrait.a = {x:.4,y:.6,scale:1.3}; shared.landscape.dpad.x = .15;
    await lib.saveSettings({...DEFAULT_SETTINGS,touchLayouts:shared,touchOpacity:.65}, true);
    vi.resetModules(); lib = await import('./library');
    const {gameSettings} = await import('./profiles');
    const settings = await lib.getSettings(), games = await lib.getGames();
    expect(games[0].profile).toEqual({speed:2}); expect(games[1].profile).toEqual({filter:'smooth'});
    for (const game of games) { expect(gameSettings(settings,game.profile).touchLayouts).toEqual(shared); expect(gameSettings(settings,game.profile).touchOpacity).toBe(.65); }
  });
  it('migrates missing layouts and rejects malformed or non-finite coordinates', () => {
    expect(normalizeTouchLayouts(undefined).portrait).toEqual(defaultTouchLayout());
    const layouts = normalizeTouchLayouts({ portrait: { a: { x: -1, y: Infinity, scale: 99 }, l: null }, landscape: 'bad' });
    expect(layouts.portrait.a).toEqual({ x: 0, y: defaultTouchLayout().a.y, scale: 1.8 });
    expect(layouts.portrait.l).toEqual(defaultTouchLayout().l);
    expect(layouts.landscape).toEqual(defaultTouchLayout(true));
  });
  it('keeps every resized control inside narrow and rotated viewports', () => {
    for (const [width, height] of [[288, 632], [812, 305], [180, 190]]) for (const group of TOUCH_GROUPS) for (const scale of [.8, 1.8]) for (const x of [0, 1]) for (const y of [0, 1]) {
      const r = touchRect(group, { x, y, scale }, width, height);
      expect(r.left).toBeGreaterThanOrEqual(0); expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(width + .0001); expect(r.top + r.height).toBeLessThanOrEqual(height + .0001);
    }
  });
  it('persists independent orientations and includes layouts in library backup/restore', async () => {
    let lib = await import('./library'); const touchLayouts = normalizeTouchLayouts(undefined);
    touchLayouts.portrait.a = { x: .3, y: .4, scale: 1.6 }; touchLayouts.landscape.l = { x: .1, y: .2, scale: 1.25 };
    await lib.saveSettings({ ...DEFAULT_SETTINGS, touchLayouts, touchOpacity: .55 });
    expect(JSON.parse(strFromU8(memory.get('library.json')!)).settings.touchLayouts).toEqual(touchLayouts);
    const backup = await lib.exportLibrary(); vi.resetModules(); lib = await import('./library');
    expect((await lib.getSettings()).touchLayouts).toEqual(touchLayouts);
    await lib.saveSettings(DEFAULT_SETTINGS);
    await lib.importLibrary(new File([backup], 'touch.koki.zip'));
    expect((await lib.getSettings()).touchLayouts).toEqual(touchLayouts);
    expect((await lib.getSettings()).touchOpacity).toBe(.55);
  });
});
