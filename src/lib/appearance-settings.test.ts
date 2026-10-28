import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '../types';

const memory = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('./storage', () => ({
  readFile: async (name: string) => memory.get(name)?.slice() ?? null,
  writeFile: async (name: string, bytes: Uint8Array) => { memory.set(name, bytes.slice()); },
  removeFile: async (name: string) => { memory.delete(name); },
  exportFile: async () => undefined,
}));
beforeEach(() => { memory.clear(); vi.resetModules(); });
async function reloadLibrary() { vi.resetModules(); return import('./library'); }
function backupFile(entries: Record<string, Uint8Array>): File { return new File([zipSync(entries).slice().buffer], 'theme.koki.zip'); }

describe('saved light and dark colors', () => {
  it('defaults missing palette choices in older libraries and backups without changing the appearance mode', async () => {
    memory.set('library.json', strToU8(JSON.stringify({ version: 1, games: [], snapshots: [], settings: { theme: 'dark', volume: 0.4 } })));
    const library = await reloadLibrary();
    let settings = await library.getSettings();
    expect(settings.lightColor).toBe('monochrome'); expect(settings.darkColor).toBe('monochrome');
    expect(settings.theme).toBe('dark'); expect(settings.volume).toBe(0.4);
    const archive = unzipSync(new Uint8Array(await (await library.exportLibrary()).arrayBuffer()));
    const manifest = JSON.parse(strFromU8(archive['koki-library.json']));
    delete manifest.settings.lightColor; delete manifest.settings.darkColor;
    archive['koki-library.json'] = strToU8(JSON.stringify(manifest));
    await library.saveSettings({ ...settings, lightColor: '#8b5cf6', darkColor: '#14b8a6' });
    await library.importLibrary(backupFile(archive));
    settings = await library.getSettings();
    expect(settings.lightColor).toBe('monochrome'); expect(settings.darkColor).toBe('monochrome');
    expect(settings.theme).toBe('dark');
  });

  it('keeps independent colors across disk serialization, a library reload and changes to one mode', async () => {
    let library = await reloadLibrary();
    await library.saveSettings({ ...DEFAULT_SETTINGS, theme: 'system', lightColor: '#2255AA', darkColor: '#F472B6' });
    const saved = JSON.parse(strFromU8(memory.get('library.json')!)).settings;
    expect(saved.lightColor).toBe('#2255aa'); expect(saved.darkColor).toBe('#f472b6');
    library = await reloadLibrary();
    let settings = await library.getSettings();
    expect(settings.theme).toBe('system'); expect(settings.lightColor).toBe('#2255aa'); expect(settings.darkColor).toBe('#f472b6');
    await library.saveSettings({ ...settings, lightColor: '#059669' });
    library = await reloadLibrary();
    settings = await library.getSettings();
    expect(settings.lightColor).toBe('#059669'); expect(settings.darkColor).toBe('#f472b6');
  });

  it('exports and restores both colors together with the selected appearance mode', async () => {
    const library = await reloadLibrary();
    await library.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light', lightColor: '#2563eb', darkColor: '#eab308' });
    const backup = await library.exportLibrary();
    const manifest = JSON.parse(strFromU8(unzipSync(new Uint8Array(await backup.arrayBuffer()))['koki-library.json']));
    expect(manifest.settings.lightColor).toBe('#2563eb'); expect(manifest.settings.darkColor).toBe('#eab308');
    await library.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', lightColor: '#ef4444', darkColor: '#14b8a6' });
    await library.importLibrary(new File([backup], 'saved-colors.koki.zip'));
    const reloaded = await reloadLibrary();
    const settings = await reloaded.getSettings();
    expect(settings.theme).toBe('light'); expect(settings.lightColor).toBe('#2563eb'); expect(settings.darkColor).toBe('#eab308');
  });

  it('normalizes accepted hex colors and rejects invalid palette data from saves and backups', async () => {
    const library = await reloadLibrary();
    await library.saveSettings({ ...DEFAULT_SETTINGS, lightColor: '#ABCDEF', darkColor: 'var(--arbitrary)' });
    let settings = await library.getSettings();
    expect(settings.lightColor).toBe('#abcdef'); expect(settings.darkColor).toBe('monochrome');
    const archive = unzipSync(new Uint8Array(await (await library.exportLibrary()).arrayBuffer()));
    const manifest = JSON.parse(strFromU8(archive['koki-library.json']));
    manifest.settings.lightColor = ['#123456']; manifest.settings.darkColor = 'url(https://invalid.example/image)';
    archive['koki-library.json'] = strToU8(JSON.stringify(manifest));
    await library.importLibrary(backupFile(archive));
    settings = await library.getSettings();
    expect(settings.lightColor).toBe('monochrome'); expect(settings.darkColor).toBe('monochrome');
  });
});

