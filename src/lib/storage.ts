import { IS_NDS } from '../platform';
import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const db = () => openDB(IS_NDS ? 'koki-nds-library-v1' : 'koki-library-v1', 1, { upgrade(database) { database.createObjectStore('files'); } });
const validPath = (path: string) => {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || path.startsWith('/')) throw new Error('Invalid library path.');
  return path;
};
function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
// Keep each Capacitor message bounded. Whole-ROM base64 transfers create several
// simultaneous copies in Android's Java heap (often limited to 256 MB).
const NATIVE_CHUNK_SIZE = 256 * 1024;
async function readNativeFile(path: string): Promise<Uint8Array> {
  const { size } = await Filesystem.stat({ directory: Directory.Data, path });
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('The saved file size could not be read.');
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += NATIVE_CHUNK_SIZE) {
    const length = Math.min(NATIVE_CHUNK_SIZE, size - offset);
    const result = await Filesystem.readFile({ directory: Directory.Data, path, offset, length });
    const chunk = typeof result.data === 'string' ? fromBase64(result.data) : new Uint8Array(await result.data.arrayBuffer());
    if (chunk.length !== length) throw new Error('The saved file is incomplete. Import it again or restore a backup.');
    bytes.set(chunk, offset);
  }
  return bytes;
}
async function writeNativeChunks(directory: Directory, path: string, source: Uint8Array | Blob): Promise<void> {
  const size = source instanceof Blob ? source.size : source.length;
  for (let offset = 0; offset < size || offset === 0; offset += NATIVE_CHUNK_SIZE) {
    const chunk = source instanceof Blob
      ? new Uint8Array(await source.slice(offset, offset + NATIVE_CHUNK_SIZE).arrayBuffer())
      : source.subarray(offset, offset + NATIVE_CHUNK_SIZE);
    const options = { directory, path, data: toBase64(chunk) };
    if (offset === 0) await Filesystem.writeFile({ ...options, recursive: true });
    else await Filesystem.appendFile(options);
  }
}
const bridge = () => typeof window !== 'undefined' ? window.kokiNative : undefined;
export async function readFile(path: string): Promise<Uint8Array | null> {
  validPath(path); if (IS_NDS) path = `nds/${path}`;
  if (bridge()) { const bytes = await bridge()!.read(path); return bytes ? new Uint8Array(bytes) : null; }
  if (Capacitor.isNativePlatform()) {
    try { return await readNativeFile(`library/${path}`); }
    catch (error) {
      if (!/not exist|not found|ENOENT/i.test(String((error as Error)?.message ?? error))) throw error;
      // Android's native move can delete its destination before renaming. A
      // completed pending write is recovery data, not an empty new library.
      let recovery;
      try { recovery = await readNativeFile(`library/${path}.pending`); }
      catch (pendingError) { if (/not exist|not found|ENOENT/i.test(String((pendingError as Error)?.message ?? pendingError))) return null; throw pendingError; }
      await Filesystem.rename({ directory: Directory.Data, from: `library/${path}.pending`, to: `library/${path}` });
      return recovery;
    }
  }
  const value = await (await db()).get('files', path) as ArrayBuffer | undefined;
  return value ? new Uint8Array(value) : null;
}
export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  validPath(path); if (IS_NDS) path = `nds/${path}`;
  if (bridge()) return bridge()!.write(path, bytes);
  if (Capacitor.isNativePlatform()) {
    const temporary = `library/${path}.pending`;
    const writing = `library/${path}.writing`;
    try {
      await writeNativeChunks(Directory.Data, writing, bytes);
      // Only completed files become recovery candidates. A killed import must
      // never expose a partly appended ROM or index as a committed file.
      await Filesystem.rename({ directory: Directory.Data, from: writing, to: temporary });
    } catch (error) {
      await Filesystem.deleteFile({ directory: Directory.Data, path: writing }).catch(() => {});
      throw error;
    }
    await Filesystem.rename({ directory: Directory.Data, from: temporary, to: `library/${path}` });
    return;
  }
  await (await db()).put('files', bytes.slice().buffer, path);
}
export async function removeFile(path: string): Promise<void> {
  validPath(path); if (IS_NDS) path = `nds/${path}`;
  if (bridge()) return bridge()!.remove(path);
  if (Capacitor.isNativePlatform()) {
    try { await Filesystem.deleteFile({ directory: Directory.Data, path: `library/${path}` }); }
    catch (error) { if (!/not exist|not found|ENOENT/i.test(String((error as Error).message))) throw error; }
    return;
  }
  await (await db()).delete('files', path);
}
export async function exportFile(blob: Blob, name: string): Promise<void> {
  const safeName = name.replace(/[^a-zA-Z0-9 ._()-]/g, '_').slice(0, 150);
  if (bridge()) { await bridge()!.exportFile(safeName, new Uint8Array(await blob.arrayBuffer())); return; }
  if (Capacitor.isNativePlatform()) {
    await writeNativeChunks(Directory.Cache, `exports/${safeName}`, blob);
    const result = await Filesystem.getUri({ directory: Directory.Cache, path: `exports/${safeName}` });
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: safeName, files: [result.uri], dialogTitle: 'Save or share your Koki export' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = safeName; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
