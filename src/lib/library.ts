import { IS_NDS, NDS_ENGINE_ID, SYSTEM, ROM_EXTENSION, ROM_PATTERN, MAX_STATE_SIZE } from '../platform';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DEFAULT_SETTINGS } from '../types';
import type { Game, GameProfile, Settings, Snapshot } from '../types';
import { readFile, writeFile, removeFile, exportFile } from './storage';
import { inspectRom, MAX_ROM_SIZE, romHash } from './rom';
import { normalizeThemeColor } from './themes';
import { normalizeControls } from './controls';
import { normalizeGameProfile } from './profiles';
import { normalizeTouchLayouts } from './touch-layout';
import { normalizeScreen, normalizeTurbo } from './mobile-play';
import { upgradeNdsPlayerDefaults } from './nds-player-defaults';

interface LibraryIndex { ndsPlayerDefaults?: number; ndsEngine?: string; version: 1; games: Game[]; snapshots: Snapshot[]; settings: Settings }
const MAX_BACKUP = 512 * 1024 * 1024;
const INDEX = 'library.json';
const romPath = (id: string) => `roms/${id}.${ROM_EXTENSION}`;
const batteryPath = (id: string) => `saves/${id}.sav`;
const snapshotPath = (id: string) => `states/${id}.state`;
let pending: Promise<unknown> = Promise.resolve();
let cached: LibraryIndex | undefined;
const clone = <T>(value: T): T => structuredClone(value);
function transaction<T>(callback: (index: LibraryIndex) => Promise<T>): Promise<T> {
  const task = pending.then(async () => { const index = await loadIndex(); const draft = clone(index); const result = await callback(draft); await writeFile(INDEX, strToU8(JSON.stringify(draft))); cached = draft; return result; });
  pending = task.catch(() => {}); return task;
}
function normalizeCoverPreference(game: Game) { if (game.coverHidden !== true) delete game.coverHidden; const profile = normalizeGameProfile(game.profile); if (profile) game.profile = profile; else delete game.profile; }
async function loadIndex(): Promise<LibraryIndex> {
  if (cached) return cached;
  const bytes = await readFile(INDEX);
  if (!bytes) return cached = { ...(IS_NDS ? {ndsPlayerDefaults:2} : {}), version: 1, games: [], snapshots: [], settings: clone(DEFAULT_SETTINGS) };
  try { const data = JSON.parse(strFromU8(bytes)) as LibraryIndex; if (data.version !== 1 || !Array.isArray(data.games) || !Array.isArray(data.snapshots)) throw new Error(); data.settings = normalizeSettings(data.settings); if (IS_NDS && data.ndsPlayerDefaults !== 2) { data.settings = upgradeNdsPlayerDefaults(data.settings); data.ndsPlayerDefaults = 2; } data.games.forEach(normalizeCoverPreference); return cached = data; }
  catch { throw new Error('Your library index could not be read. Restore a Koki backup to recover it; your game files have not been removed.'); }
}
function normalizeSettings(value: Partial<Settings> = {}): Settings {
  const defaults = clone(DEFAULT_SETTINGS);
  const number = (item: unknown, fallback: number, min: number, max: number) => typeof item === 'number' && Number.isFinite(item) ? Math.max(min, Math.min(max, item)) : fallback;
  return { ...defaults, ...value,
    theme: ['system', 'light', 'dark'].includes(value.theme ?? '') ? value.theme! : defaults.theme,
    lightColor: normalizeThemeColor(value.lightColor), darkColor: normalizeThemeColor(value.darkColor),
    filter: ['pixel', 'smooth', 'lcd'].includes(value.filter ?? '') ? value.filter! : defaults.filter,
    volume: number(value.volume, defaults.volume, 0, 1), speed: number(value.speed, 1, 0.5, 4),
    rewindSeconds: number(value.rewindSeconds, defaults.rewindSeconds, 0, 20), touchOpacity: number(value.touchOpacity, 0.75, 0.2, 1),
    controls: normalizeControls(value.controls),
    ...(IS_NDS ? {dsLayout: ['vertical','horizontal','bottom'].includes(value.dsLayout ?? '') ? value.dsLayout : 'vertical', dsSwap:value.dsSwap===true, dsControls:{x:typeof value.dsControls?.x === 'string' ? value.dsControls.x.slice(0,40) : 'KeyI',y:typeof value.dsControls?.y === 'string' ? value.dsControls.y.slice(0,40) : 'KeyU'}} : {}),
    touchLayouts: normalizeTouchLayouts(value.touchLayouts),
    gameScreen: normalizeScreen(value.gameScreen ?? defaults.gameScreen), turbo: normalizeTurbo(value.turbo), touchVibration: value.touchVibration === true,
    autoResume: typeof value.autoResume === 'boolean' ? value.autoResume : true,
    touchControls: typeof value.touchControls === 'boolean' ? value.touchControls : true,
    artworkColor: typeof value.artworkColor === 'boolean' ? value.artworkColor : true,
  };
}
async function indexForRead() { await pending; return loadIndex(); }
export async function getGames(): Promise<Game[]> { return clone((await indexForRead()).games); }
export async function getSettings(): Promise<Settings> { return clone((await indexForRead()).settings); }
export async function saveSettings(settings: Settings): Promise<void> { await transaction(async index => { index.settings = normalizeSettings(settings); }); }
export async function getRom(id: string): Promise<Uint8Array> {
  const index = await indexForRead(); if (!index.games.some(game => game.id === id)) throw new Error('This game is no longer in your library.');
  const bytes = await readFile(romPath(id)); if (!bytes) throw new Error('This game file is missing. Import it again to reconnect your saves.'); return bytes;
}
export async function importGames(files: File[]): Promise<{ imported: Game[]; errors: string[] }> {
  const imported: Game[] = [], errors: string[] = [];
  for (const file of files) {
    try {
      if (file.size > (IS_NDS ? 512 : 64) * 1024 * 1024) throw new Error(`${file.name}: this import exceeds the ${IS_NDS ? 512 : 64} MB file limit.`);
      let candidates: Array<[string, Uint8Array]> = [];
      const raw = new Uint8Array(await file.arrayBuffer());
      if (/\.zip$/i.test(file.name)) {
        let extracted = 0;
        const archive = unzipSync(raw, { filter(entry) { const include = ROM_PATTERN.test(entry.name) && entry.originalSize <= MAX_ROM_SIZE; if (include) extracted += entry.originalSize; if (extracted > (IS_NDS ? 512 : 128) * 1024 * 1024) throw new Error('This ZIP contains too much game data. Import games in smaller batches.'); return include; } });
        candidates = Object.entries(archive).map(([name, bytes]) => [name.split(/[\\/]/).pop()!, bytes]);
        if (!candidates.length) throw new Error(`${file.name}: no ${SYSTEM} games were found in this ZIP.`);
      } else if (ROM_PATTERN.test(file.name)) candidates = [[file.name, raw]];
      else throw new Error(`${file.name}: choose a ${SYSTEM} game or ZIP file.`);
      for (const [name, bytes] of candidates) {
        try {
          const metadata = inspectRom(bytes, name), hash = await romHash(bytes);
          const game = await transaction(async index => {
            const duplicate = index.games.find(item => item.id === hash);
            if (duplicate) { if (!await readFile(romPath(hash))) await writeFile(romPath(hash), bytes); return duplicate; }
            const added: Game = { id: hash, hash, ...metadata, fileName: name, size: bytes.length, addedAt: Date.now(), playTime: 0, favorite: false };
            await writeFile(romPath(hash), bytes); index.games.push(added); return added;
          });
          if (!imported.some(item => item.id === game.id)) imported.push(clone(game));
        } catch (error) { errors.push((error as Error).message); }
      }
    } catch (error) { errors.push((error as Error).message || `Could not import ${file.name}.`); }
  }
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
  return { imported, errors };
}
export async function updateGame(id: string, changes: Partial<Game>): Promise<Game> {
  return transaction(async index => {
    const game = index.games.find(item => item.id === id); if (!game) throw new Error('This game is no longer in your library.');
    if (typeof changes.title === 'string' && changes.title.trim()) game.title = changes.title.trim().slice(0, 150);
    if (typeof changes.favorite === 'boolean') game.favorite = changes.favorite;
    if (typeof changes.lastPlayed === 'number' && Number.isFinite(changes.lastPlayed)) game.lastPlayed = changes.lastPlayed;
    if (typeof changes.playTime === 'number' && Number.isFinite(changes.playTime)) game.playTime = Math.max(0, changes.playTime);
    for (const field of ['cover', 'screenshot'] as const) if (typeof changes[field] === 'string' && changes[field]!.startsWith('data:image/') && changes[field]!.length < 2 * 1024 * 1024) { game[field] = changes[field]; if (field === 'cover') delete game.coverHidden; }
    return clone(game);
  });
}
export async function saveGameProfile(gameId: string, patch: GameProfile | null): Promise<Game> {
  return transaction(async index => {
    const game = index.games.find(item => item.id === gameId);
    if (!game) throw new Error('This game is no longer in your library.');
    const profile = patch === null ? undefined : normalizeGameProfile({ ...game.profile, ...patch });
    if (profile) game.profile = profile; else delete game.profile;
    return clone(game);
  });
}
export async function removeCover(gameId: string): Promise<void> {
  await transaction(async index => {
    const game = index.games.find(item => item.id === gameId); if (!game) throw new Error('This game is no longer in your library.');
    delete game.cover; game.coverHidden = true;
  });
}
export async function restoreDefaultCover(gameId: string): Promise<void> {
  await transaction(async index => {
    const game = index.games.find(item => item.id === gameId); if (!game) throw new Error('This game is no longer in your library.');
    delete game.cover; delete game.coverHidden;
  });
}
export async function deleteGame(id: string): Promise<void> {
  const paths = await transaction(async index => {
    if (IS_NDS) {
      const backupPath = 'migrations/pre-0.1.1/library.json';
      const backup = await readFile(backupPath);
      if (backup) { const archived = JSON.parse(strFromU8(backup)) as LibraryIndex; archived.games = archived.games.filter(game => game.id !== id); archived.snapshots = archived.snapshots.filter(snapshot => snapshot.gameId !== id); await writeFile(backupPath, strToU8(JSON.stringify(archived))); }
    }
    const snapshots = index.snapshots.filter(item => item.gameId === id); index.games = index.games.filter(item => item.id !== id); index.snapshots = index.snapshots.filter(item => item.gameId !== id); return [romPath(id), batteryPath(id), `saves/${id}.previous.sav`, ...(IS_NDS ? [`migrations/pre-0.1.1/${id}.sav`] : []), ...snapshots.map(item => snapshotPath(item.id))]; });
  await Promise.all(paths.map(removeFile));
}
export async function prepareNdsEngine(): Promise<boolean> {
  if (!IS_NDS) return false;
  return transaction(async index => {
    if (index.ndsEngine === NDS_ENGINE_ID) return false;
    const previous = await readFile(INDEX);
    if (previous && !await readFile('migrations/pre-0.1.1/library.json')) await writeFile('migrations/pre-0.1.1/library.json', previous);
    for (const game of index.games) {
      const save = await readFile(batteryPath(game.id));
      const backup = `migrations/pre-0.1.1/${game.id}.sav`;
      if (save && !await readFile(backup)) await writeFile(backup, save);
    }
    let legacy = false;
    for (const snapshot of index.snapshots) if (snapshot.engine !== NDS_ENGINE_ID) {
      snapshot.engine ||= 'pilas-legacy'; snapshot.kind = 'backup';
      if (!snapshot.label.startsWith('Earlier DS engine: ')) snapshot.label = ('Earlier DS engine: ' + snapshot.label).slice(0, 100);
      legacy = true;
    }
    index.ndsEngine = NDS_ENGINE_ID;
    return legacy;
  });
}
export async function getSnapshots(gameId?: string): Promise<Snapshot[]> { return clone((await indexForRead()).snapshots.filter(item => !gameId || item.gameId === gameId).sort((a, b) => b.createdAt - a.createdAt)); }
export async function createSnapshot(gameId: string, bytes: Uint8Array, options: { label: string; kind: Snapshot['kind']; thumbnail?: string }): Promise<Snapshot> {
  if (!bytes.length || bytes.length > MAX_STATE_SIZE) throw new Error('The emulator did not produce a valid snapshot.');
  const result = await transaction(async index => {
    if (!index.games.some(game => game.id === gameId)) throw new Error('The game is no longer in your library.');
    const snapshot: Snapshot = { id: crypto.randomUUID(), gameId, label: options.label.trim().slice(0, 100) || 'Checkpoint', kind: options.kind, createdAt: Date.now(), thumbnail: options.thumbnail, ...(IS_NDS ? { engine: NDS_ENGINE_ID } : {}) };
    await writeFile(snapshotPath(snapshot.id), bytes); index.snapshots.push(snapshot);
    const limit = options.kind === 'manual' ? 30 : 5;
    const older = index.snapshots.filter(item => item.gameId === gameId && item.kind === options.kind && (!IS_NDS || item.engine === NDS_ENGINE_ID)).sort((a, b) => b.createdAt - a.createdAt).slice(limit);
    const remove = new Set(older.map(item => item.id)); index.snapshots = index.snapshots.filter(item => !remove.has(item.id));
    return { snapshot: clone(snapshot), stale: older.map(item => snapshotPath(item.id)) };
  });
  await Promise.all(result.stale.map(path => removeFile(path).catch(() => {}))); return result.snapshot;
}
export async function getSnapshotData(id: string): Promise<Uint8Array> {
  if (!(await indexForRead()).snapshots.some(item => item.id === id)) throw new Error('This checkpoint no longer exists.');
  const bytes = await readFile(snapshotPath(id)); if (!bytes) throw new Error('The checkpoint file is missing.'); return bytes;
}
export async function deleteSnapshot(id: string): Promise<void> { await transaction(async index => { index.snapshots = index.snapshots.filter(item => item.id !== id); }); await removeFile(snapshotPath(id)); }
export async function readBattery(gameId: string): Promise<Uint8Array | null> { await pending; return readFile(batteryPath(gameId)); }
export async function writeBattery(gameId: string, bytes: Uint8Array): Promise<void> {
  if (!bytes.length || bytes.length > (IS_NDS ? 8 : 1) * 1024 * 1024) throw new Error('Invalid game save data.');
  await transaction(async index => { if (!index.games.some(game => game.id === gameId)) throw new Error('Game not found.'); const previous = await readFile(batteryPath(gameId)); if (previous) await writeFile(`saves/${gameId}.previous.sav`, previous); await writeFile(batteryPath(gameId), bytes); });
}
export async function exportBattery(gameId: string): Promise<Blob | null> { const bytes = await readBattery(gameId); return bytes ? new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }) : null; }
export async function importBattery(gameId: string, file: File): Promise<void> {
  if (file.size < 512 || file.size > (IS_NDS ? 8 : 1) * 1024 * 1024) throw new Error('Choose an ordinary .sav game save between 512 bytes and 1 MB.');
  if (!/\.sav$/i.test(file.name)) throw new Error('Choose a .sav game save. My Boy! save states are not interchangeable.');
  await writeBattery(gameId, new Uint8Array(await file.arrayBuffer()));
  await transaction(async index => { for (const snapshot of index.snapshots) if (snapshot.gameId === gameId && snapshot.kind === 'auto') { snapshot.kind = 'backup'; snapshot.label = `Before save import: ${snapshot.label}`.slice(0, 100); } });
}
export async function saveCover(gameId: string, file: File): Promise<void> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image under 8 MB.');
  const image = await createImageBitmap(file);
  try { const canvas = document.createElement('canvas'); canvas.width = Math.min(480, image.width); canvas.height = Math.round(image.height * canvas.width / image.width); if (canvas.height > 1200) throw new Error('This image is too tall for a game cover.'); const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare this cover.'); context.drawImage(image, 0, 0, canvas.width, canvas.height); await updateGame(gameId, { cover: canvas.toDataURL('image/jpeg', 0.85) }); }
  finally { image.close(); }
}
export async function exportLibrary(): Promise<Blob> {
  const index = clone(await indexForRead()); const entries: Record<string, Uint8Array> = { 'koki-library.json': strToU8(JSON.stringify({ format: (IS_NDS ? 'koki-nds-library' : 'koki-library'), ...index })) };
  let total = 0;
  for (const game of index.games) for (const path of [romPath(game.id), batteryPath(game.id)]) { const bytes = await readFile(path); if (!bytes && path === romPath(game.id)) throw new Error(`The game file for ${game.title} is missing. Import it again before backing up.`); if (bytes) { total += bytes.length; if (total > MAX_BACKUP) throw new Error('This collection exceeds the 512 MB backup limit. Export game saves separately.'); entries[`data/${path}`] = bytes; } }
  for (const snapshot of index.snapshots) { const bytes = await readFile(snapshotPath(snapshot.id)); if (!bytes) throw new Error(`Checkpoint ${snapshot.label} is missing. Remove that checkpoint before backing up.`); total += bytes.length; if (total > MAX_BACKUP) throw new Error('This backup exceeds 512 MB.'); entries[`data/${snapshotPath(snapshot.id)}`] = bytes; }
  const zip = zipSync(entries, { level: 1 }); return new Blob([zip.slice().buffer], { type: 'application/zip' });
}
export async function importLibrary(file: File): Promise<void> {
  if (file.size > MAX_BACKUP) throw new Error('Choose a Koki backup under 512 MB.');
  let expanded = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) { expanded += entry.originalSize; if (expanded > MAX_BACKUP || entry.originalSize > 40 * 1024 * 1024) throw new Error('This backup exceeds the supported size.'); return true; } });
  if (!archive['koki-library.json']) throw new Error('This ZIP is not a Koki library backup.');
  let incoming: LibraryIndex & { format: string };
  try { incoming = JSON.parse(strFromU8(archive['koki-library.json'])); } catch { throw new Error('The backup manifest is damaged.'); }
  if (incoming.format !== (IS_NDS ? 'koki-nds-library' : 'koki-library') || incoming.version !== 1 || !Array.isArray(incoming.games) || !Array.isArray(incoming.snapshots) || incoming.games.length > 3000 || incoming.snapshots.length > 15000) throw new Error('This backup format is not supported.');
  for (const game of incoming.games) {
    if (!/^[a-f0-9]{64}$/.test(game.id) || game.id !== game.hash || typeof game.title !== 'string') throw new Error('The backup contains invalid game metadata.');
    const bytes = archive[`data/${romPath(game.id)}`]; if (!bytes) throw new Error(`The backup is missing ${game.title}.`); const metadata = inspectRom(bytes, game.fileName || `backup.${ROM_EXTENSION}`); if (await romHash(bytes) !== game.hash) throw new Error(`The backup game ${game.title} failed its integrity check.`);
    game.title = game.title.slice(0, 150); game.fileName = typeof game.fileName === 'string' ? game.fileName.split(/[\\/]/).pop()!.slice(0, 160) : `${game.title}.${ROM_EXTENSION}`; game.size = bytes.length; game.code = metadata.code;
    normalizeCoverPreference(game);
    game.favorite = game.favorite === true; game.addedAt = Number.isFinite(game.addedAt) ? game.addedAt : Date.now(); game.playTime = Number.isFinite(game.playTime) ? Math.max(0, game.playTime) : 0;
    if (!Number.isFinite(game.lastPlayed)) delete game.lastPlayed;
    for (const field of ['cover', 'screenshot'] as const) if (typeof game[field] !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(game[field]!) || game[field]!.length > 2 * 1024 * 1024) delete game[field];
    const battery = archive[`data/${batteryPath(game.id)}`]; if (battery && (battery.length < 512 || battery.length > 1024 * 1024)) throw new Error('The backup contains an invalid game save.');
  }
  const gameIds = new Set(incoming.games.map(game => game.id));
  for (const snapshot of incoming.snapshots) {
    const state = archive[`data/${snapshotPath(snapshot.id)}`];
    if (!/^[a-f0-9-]{36}$/.test(snapshot.id) || !gameIds.has(snapshot.gameId) || !state || state.length > MAX_STATE_SIZE || !['manual', 'auto', 'backup'].includes(snapshot.kind) || typeof snapshot.label !== 'string' || !Number.isFinite(snapshot.createdAt)) throw new Error('The backup contains invalid checkpoints.');
    snapshot.label = snapshot.label.slice(0, 100); if (typeof snapshot.thumbnail !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(snapshot.thumbnail) || snapshot.thumbnail.length > 2 * 1024 * 1024) delete snapshot.thumbnail;
  }
  const settings = normalizeSettings(incoming.settings ?? {});
  await pending;
  try { await loadIndex(); } catch { const damaged = await readFile(INDEX); if (damaged) await writeFile('library-recovery.json', damaged); cached = { version: 1, games: [], snapshots: [], settings: clone(DEFAULT_SETTINGS) }; }
  await transaction(async index => {
    for (const snapshot of incoming.snapshots) { const existing = index.snapshots.find(item => item.id === snapshot.id); if (existing && existing.gameId !== snapshot.gameId) throw new Error('A checkpoint identifier conflicts with an existing game.'); }
    for (const game of incoming.games) { await writeFile(romPath(game.id), archive[`data/${romPath(game.id)}`]); const existing = index.games.find(item => item.id === game.id); if (!existing) index.games.push({ ...game, title: game.title.slice(0, 150) }); else { if (game.profile) existing.profile = clone(game.profile); else delete existing.profile; delete existing.cover; if (game.cover) existing.cover = game.cover; if (game.coverHidden === true) existing.coverHidden = true; else delete existing.coverHidden; } const save = archive[`data/${batteryPath(game.id)}`]; if (save) { const previous = await readFile(batteryPath(game.id)); if (previous) await writeFile(`saves/${game.id}.previous.sav`, previous); await writeFile(batteryPath(game.id), save); for (const snapshot of index.snapshots) if (snapshot.gameId === game.id && snapshot.kind === 'auto') { snapshot.kind = 'backup'; snapshot.label = `Before backup restore: ${snapshot.label}`.slice(0, 100); } } }
    for (const snapshot of incoming.snapshots) { const existing = index.snapshots.find(item => item.id === snapshot.id); await writeFile(snapshotPath(snapshot.id), archive[`data/${snapshotPath(snapshot.id)}`]); if (!existing) index.snapshots.push(snapshot); else Object.assign(existing, snapshot); }
    index.settings = settings;
  });
}
export function downloadBlob(blob: Blob, fileName: string): Promise<void> { return exportFile(blob, fileName); }
