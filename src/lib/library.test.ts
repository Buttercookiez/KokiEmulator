import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { importGames, getGames, getRom, updateGame, writeBattery, readBattery, createSnapshot, getSnapshots, getSnapshotData, exportLibrary, importLibrary, importBattery, saveSettings, getSettings, removeCover, restoreDefaultCover } from './library';
import { inspectRom } from './rom';
import { DEFAULT_SETTINGS } from '../types';
import { readFile } from './storage';
import { getGameCover } from './artwork';

function rom(title = 'KOKI TEST'): Uint8Array {
  const bytes = new Uint8Array(32768); bytes.set(new TextEncoder().encode(title), 0xa0); bytes[0xb2] = 0x96;
  let sum = -0x19; for (let i = 0xa0; i <= 0xbc; i++) sum -= bytes[i]; bytes[0xbd] = sum & 255; return bytes;
}
function file(bytes: Uint8Array, name: string): File { return new File([bytes.slice().buffer], name); }
describe('local library integrity', () => {
  it('rejects malformed headers and deduplicates the same ROM imported under another filename', async () => {
    expect(() => inspectRom(new Uint8Array(200), 'bad.gba')).toThrow('header');
    const data = rom();
    const results = await importGames([file(data, 'Koki.gba'), file(data, 'Renamed.gba'), file(new Uint8Array(200), 'Bad.gba')]);
    expect(results.imported).toHaveLength(1); expect(results.errors).toHaveLength(1);
    const games = await getGames(); expect(games).toHaveLength(1); expect(await getRom(games[0].id)).toEqual(data);
  });
  it('extracts games from ZIP and ignores unrelated archive files', async () => {
    const archive = zipSync({ 'folder/Second.gba': rom('SECOND GAME'), 'notes.txt': strToU8('not a game') });
    const result = await importGames([file(archive, 'collection.zip')]); expect(result.imported).toHaveLength(1); expect(await getGames()).toHaveLength(2);
  });
  it('serializes concurrent changes and keeps battery saves separate from emulator snapshots', async () => {
    const game = (await getGames())[0];
    await Promise.all([updateGame(game.id, { favorite: true }), updateGame(game.id, { playTime: 15 })]);
    const changed = (await getGames()).find(item => item.id === game.id)!; expect(changed.favorite).toBe(true); expect(changed.playTime).toBe(15);
    const battery = new Uint8Array(32768).fill(7); await writeBattery(game.id, battery);
    const state = await createSnapshot(game.id, new Uint8Array([1, 2, 3]), { label: 'Checkpoint', kind: 'manual' });
    expect(await readBattery(game.id)).toEqual(battery); expect(await getSnapshotData(state.id)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('rotates automatic snapshots without deleting manual checkpoints', async () => {
    const game = (await getGames())[0];
    for (let i = 0; i < 8; i++) await createSnapshot(game.id, new Uint8Array([i + 1]), { label: String(i), kind: 'auto' });
    const snapshots = await getSnapshots(game.id); expect(snapshots.filter(item => item.kind === 'auto')).toHaveLength(5); expect(snapshots.filter(item => item.kind === 'manual')).toHaveLength(1);
  });
  it('exports and restores a validated backup without duplicating games', async () => {
    const backup = await exportLibrary(); await importLibrary(new File([backup], 'library.koki.zip'));
    expect(await getGames()).toHaveLength(2); expect(await getSnapshots()).toHaveLength(6);
  });
  it('rejects a tampered backup before writing anything', async () => {
    const malicious = zipSync({ 'koki-library.json': strToU8(JSON.stringify({ format: 'koki-library', version: 1, games: [{ id: '../../escape', hash: '../../escape', title: 'Bad' }], snapshots: [] })) });
    await expect(importLibrary(file(malicious, 'bad.zip'))).rejects.toThrow('invalid game metadata'); expect(await getGames()).toHaveLength(2);
  });
  it('normalizes out-of-range preferences while preserving a user control map', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, volume: 9, rewindSeconds: -5, controls: { ...DEFAULT_SETTINGS.controls, a: 'KeyJ' } });
    const settings = await getSettings(); expect(settings.volume).toBe(1); expect(settings.rewindSeconds).toBe(0); expect(settings.controls.a).toBe('KeyJ');
  });
  it('rejects checkpoint conflicts before overwriting a live game save', async () => {
    const games = await getGames(); const archive = unzipSync(new Uint8Array(await (await exportLibrary()).arrayBuffer()));
    const manifest = JSON.parse(strFromU8(archive['koki-library.json'])); manifest.snapshots[0].gameId = games[1].id;
    archive['koki-library.json'] = strToU8(JSON.stringify(manifest)); archive[`data/saves/${games[0].id}.sav`] = new Uint8Array(32768).fill(99);
    await expect(importLibrary(file(zipSync(archive), 'conflict.zip'))).rejects.toThrow('conflicts');
    expect((await readBattery(games[0].id))![0]).toBe(7);
  });
  it('preserves old checkpoints as recovery when importing an in-game save', async () => {
    const game = (await getGames())[0]; await importBattery(game.id, file(new Uint8Array(32768).fill(12), 'new.sav'));
    expect((await readBattery(game.id))![0]).toBe(12); expect((await getSnapshots(game.id)).some(snapshot => snapshot.kind === 'auto')).toBe(false);
    expect((await getSnapshots(game.id)).some(snapshot => snapshot.label.startsWith('Before save import:'))).toBe(true);
  });

  it('removes cover artwork persistently while leaving game files and progress untouched', async () => {
    const game = (await getGames())[0];
    const romBefore = await getRom(game.id), batteryBefore = await readBattery(game.id);
    const snapshotsBefore = await getSnapshots(game.id);
    const statesBefore = await Promise.all(snapshotsBefore.map(snapshot => getSnapshotData(snapshot.id)));
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZ0AAAAASUVORK5CYII=';
    await updateGame(game.id, { cover: image, screenshot: image });
    await Promise.all([removeCover(game.id), updateGame(game.id, { playTime: 47, favorite: false, screenshot: image })]);
    const changed = (await getGames()).find(item => item.id === game.id)!;
    expect(changed.cover).toBeUndefined(); expect(changed.coverHidden).toBe(true); expect(getGameCover(changed)).toBeUndefined();
    expect(changed.screenshot).toBe(image); expect(changed.playTime).toBe(47);
    const persisted = JSON.parse(strFromU8((await readFile('library.json'))!)).games.find((item: { id: string }) => item.id === game.id);
    expect(persisted.coverHidden).toBe(true); expect(persisted.cover).toBeUndefined();
    expect(await getRom(game.id)).toEqual(romBefore); expect(await readBattery(game.id)).toEqual(batteryBefore);
    expect(await getSnapshots(game.id)).toEqual(snapshotsBefore);
    expect(await Promise.all(snapshotsBefore.map(snapshot => getSnapshotData(snapshot.id)))).toEqual(statesBefore);
  });
  it('restores automatic artwork and unhides artwork when a new custom cover is selected', async () => {
    const game = (await getGames())[0];
    await restoreDefaultCover(game.id);
    let changed = (await getGames()).find(item => item.id === game.id)!;
    expect(changed.coverHidden).toBeUndefined(); expect(changed.cover).toBeUndefined(); expect(getGameCover(changed)).toBe(changed.screenshot);
    await removeCover(game.id);
    const image = changed.screenshot!;
    await updateGame(game.id, { cover: image });
    changed = (await getGames()).find(item => item.id === game.id)!;
    expect(changed.coverHidden).toBeUndefined(); expect(getGameCover(changed)).toBe(image);
  });
  it('restores cover removal from backups for installed games and ignores non-boolean flags', async () => {
    const game = (await getGames())[0];
    await removeCover(game.id);
    const backup = await exportLibrary();
    const archive = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(archive['koki-library.json']));
    expect(manifest.games.find((item: { id: string }) => item.id === game.id).coverHidden).toBe(true);
    await restoreDefaultCover(game.id);
    await importLibrary(new File([backup], 'hidden-covers.koki.zip'));
    expect((await getGames()).find(item => item.id === game.id)!.coverHidden).toBe(true);
    manifest.games.find((item: { id: string }) => item.id === game.id).coverHidden = 'true';
    archive['koki-library.json'] = strToU8(JSON.stringify(manifest));
    await importLibrary(file(zipSync(archive), 'invalid-cover-flag.koki.zip'));
    const restored = (await getGames()).find(item => item.id === game.id)!;
    expect(restored.coverHidden).toBeUndefined(); expect(getGameCover(restored)).toBe(restored.screenshot);
  });
});
