import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '../types';
import { gameSettings, normalizeGameProfile } from './profiles';

const memory = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('./storage', () => ({
  readFile: async (name: string) => memory.get(name)?.slice() ?? null,
  writeFile: async (name: string, bytes: Uint8Array) => { memory.set(name, bytes.slice()); },
  removeFile: async (name: string) => { memory.delete(name); },
  exportFile: async () => undefined,
}));
beforeEach(() => { memory.clear(); vi.resetModules(); });
const library = () => import('./library');
function rom(title: string) {
  const data = new Uint8Array(32768); data.set(new TextEncoder().encode(title), 0xa0); data[0xb2] = 0x96;
  let sum = -0x19; for (let i = 0xa0; i <= 0xbc; i++) sum -= data[i]; data[0xbd] = sum & 255;
  return new File([data], title + '.gba');
}
async function twoGames() {
  const lib = await library();
  const result = await lib.importGames([rom('FOREST'), rom('CIRCUIT')]);
  return { lib, first: result.imported[0], second: result.imported[1] };
}
describe('per-game play profiles', () => {
  it('ignores malformed and unrelated profile fields', () => {
    for (const value of [null, [], true, 'speed', {}, { speed: NaN, filter: 'invalid', controls: [] }]) expect(normalizeGameProfile(value)).toBeUndefined();
    expect(normalizeGameProfile({ speed: 2, theme: 'dark', volume: 0, filter: 'lcd' })).toEqual({ speed: 2, filter: 'lcd' });
  });
  it('bounds speed and preserves explicit custom key mappings without shared mutable controls', () => {
    const input = { speed: 99, controls: { ...DEFAULT_SETTINGS.controls, up: 'KeyI' } };
    const profile = normalizeGameProfile(input)!;
    expect(profile.speed).toBe(4); expect(profile.controls!.up).toBe('KeyI');
    profile.controls!.up = 'KeyU'; expect(input.controls.up).toBe('KeyI');
    expect(normalizeGameProfile({ speed: -2 })?.speed).toBe(.5);
  });
  it('inherits current global defaults for fields without overrides and never overrides appearance', () => {
    const global = { ...DEFAULT_SETTINGS, speed: 3, volume: .3, theme: 'dark' as const, controls: { ...DEFAULT_SETTINGS.controls, a: 'KeyC' } };
    const effective = gameSettings(global, { filter: 'smooth' });
    expect(effective.speed).toBe(3); expect(effective.volume).toBe(.3); expect(effective.theme).toBe('dark'); expect(effective.filter).toBe('smooth');
    effective.controls.a = 'KeyV'; expect(global.controls.a).toBe('KeyC');
  });
  it('serializes concurrent profile edits and isolates games and global defaults across reload', async () => {
    const { lib, first, second } = await twoGames();
    await Promise.all([lib.saveGameProfile(first.id, { speed: 2 }), lib.saveGameProfile(first.id, { filter: 'lcd' })]);
    await lib.saveGameProfile(second.id, { controls: { ...DEFAULT_SETTINGS.controls, a: 'KeyC' } });
    vi.resetModules(); const reloaded = await library(); const games = await reloaded.getGames();
    expect(games.find(game => game.id === first.id)?.profile).toEqual({ speed: 2, filter: 'lcd' });
    expect(games.find(game => game.id === second.id)?.profile?.controls?.a).toBe('KeyC');
    expect((await reloaded.getSettings()).speed).toBe(1);
  });
  it('round trips profiles in backups and restores older backups as inherited defaults without losing saves', async () => {
    const { lib, first } = await twoGames();
    await lib.writeBattery(first.id, new Uint8Array(32768).fill(7));
    await lib.saveGameProfile(first.id, { speed: 2, filter: 'smooth' });
    const backup = await lib.exportLibrary();
    await lib.saveGameProfile(first.id, { speed: 4 });
    await lib.importLibrary(new File([backup], 'profiles.koki.zip'));
    expect((await lib.getGames()).find(game => game.id === first.id)?.profile).toEqual({ speed: 2, filter: 'smooth' });
    const entries = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['koki-library.json']));
    for (const game of manifest.games) delete game.profile;
    entries['koki-library.json'] = strToU8(JSON.stringify(manifest));
    await lib.importLibrary(new File([zipSync(entries)], 'old.koki.zip'));
    expect((await lib.getGames()).find(game => game.id === first.id)?.profile).toBeUndefined();
    expect((await lib.readBattery(first.id))?.[0]).toBe(7);
  });
  it('normalizes profiles in legacy library metadata without rewriting unrelated data', async () => {
    memory.set('library.json', strToU8(JSON.stringify({ version: 1, games: [{ id: 'existing', profile: { speed: 100, filter: 'javascript', theme: 'dark' } }, { id: 'legacy' }], snapshots: [{ id: 'untouched' }], settings: DEFAULT_SETTINGS })));
    const lib = await library(); const games = await lib.getGames();
    expect(games[0].profile).toEqual({ speed: 4 }); expect(games[1].profile).toBeUndefined();
    expect(await lib.getSnapshots()).toHaveLength(1);
    expect(JSON.parse(strFromU8(memory.get('library.json')!)).games[0].profile.speed).toBe(100);
  });
  it('removes a game override and rejects absent game edits while preserving other games', async () => {
    const { lib, first, second } = await twoGames();
    await lib.saveGameProfile(first.id, { speed: 2 }); await lib.saveGameProfile(first.id, null);
    expect((await lib.getGames()).find(game => game.id === first.id)?.profile).toBeUndefined();
    await expect(lib.saveGameProfile('missing', { speed: 4 })).rejects.toThrow('no longer');
    expect((await lib.getGames()).find(game => game.id === second.id)?.profile).toBeUndefined();
  });
  it('includes per-game mobile layouts and screen/turbo options in backup restore', async () => {
    const { lib, first, second } = await twoGames();
    const { touchPreset } = await import('./touch-layout');
    const mobile = { touchLayouts: { portrait: touchPreset('left'), landscape: touchPreset('large',true) }, gameScreen: { position: 'top' as const, scale: .8 }, turbo: { a:true,b:false,rate:6 }, touchVibration: true };
    await lib.saveGameProfile(first.id,mobile); const backup=await lib.exportLibrary();
    await lib.saveGameProfile(first.id,null); await lib.importLibrary(new File([backup],'mobile.koki.zip'));
    vi.resetModules(); const reloaded=await library(); const games=await reloaded.getGames();
    expect(games.find(g=>g.id===first.id)?.profile).toEqual(mobile);
    expect(games.find(g=>g.id===second.id)?.profile).toBeUndefined();
    expect((await reloaded.getSettings()).turbo.a).toBe(false);
  });

});

