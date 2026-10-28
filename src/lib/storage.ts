import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const db = () => openDB('koki-library-v1', 1, { upgrade(database) { database.createObjectStore('files'); } });
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
const bridge = () => typeof window !== 'undefined' ? window.kokiNative : undefined;
export async function readFile(path: string): Promise<Uint8Array | null> {
  validPath(path);
  if (bridge()) { const bytes = await bridge()!.read(path); return bytes ? new Uint8Array(bytes) : null; }
  if (Capacitor.isNativePlatform()) {
    try { const result = await Filesystem.readFile({ directory: Directory.Data, path: `library/${path}` }); return typeof result.data === 'string' ? fromBase64(result.data) : new Uint8Array(await result.data.arrayBuffer()); }
    catch (error) {
      if (!/not exist|not found|ENOENT/i.test(String((error as Error)?.message ?? error))) throw error;
      // Android's native move can delete its destination before renaming. A
      // completed pending write is recovery data, not an empty new library.
      let recovery;
      try { recovery = await Filesystem.readFile({ directory: Directory.Data, path: `library/${path}.pending` }); }
      catch (pendingError) { if (/not exist|not found|ENOENT/i.test(String((pendingError as Error)?.message ?? pendingError))) return null; throw pendingError; }
      await Filesystem.rename({ directory: Directory.Data, from: `library/${path}.pending`, to: `library/${path}` });
      return typeof recovery.data === 'string' ? fromBase64(recovery.data) : new Uint8Array(await recovery.data.arrayBuffer());
    }
  }
  const value = await (await db()).get('files', path) as ArrayBuffer | undefined;
  return value ? new Uint8Array(value) : null;
}
export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  validPath(path);
  if (bridge()) return bridge()!.write(path, bytes);
  if (Capacitor.isNativePlatform()) {
    const temporary = `library/${path}.pending`;
    await Filesystem.writeFile({ directory: Directory.Data, path: temporary, data: toBase64(bytes), recursive: true });
    await Filesystem.rename({ directory: Directory.Data, from: temporary, to: `library/${path}` });
    return;
  }
  await (await db()).put('files', bytes.slice().buffer, path);
}
export async function removeFile(path: string): Promise<void> {
  validPath(path);
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
    const result = await Filesystem.writeFile({ directory: Directory.Cache, path: `exports/${safeName}`, data: toBase64(new Uint8Array(await blob.arrayBuffer())), recursive: true });
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: safeName, files: [result.uri], dialogTitle: 'Save or share your Koki export' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = safeName; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
