import { beforeEach, describe, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => ({ files: new Map<string, Blob>(), rejectMove: false, rejectAppend: false, shortRead: false, maxRead: 0, maxWrite: 0 }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE' },
  Filesystem: {
    stat: vi.fn(async ({ path }: { path: string }) => { const file = memory.files.get(path); if (!file) throw new Error('File does not exist'); return { size: file.size }; }),
    readFile: vi.fn(async ({ path, offset, length }: { path: string; offset: number; length: number }) => {
      const file = memory.files.get(path); if (!file) throw new Error('File does not exist');
      memory.maxRead = Math.max(memory.maxRead, length);
      if (!Number.isFinite(length) || length > 256 * 1024) throw new Error('Unbounded native read');
      const data = Buffer.from(await file.slice(offset, offset + length - (memory.shortRead ? 1 : 0)).arrayBuffer()).toString('base64');
      return { data };
    }),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      const bytes = Buffer.from(data, 'base64'); memory.maxWrite = Math.max(memory.maxWrite, bytes.length);
      if (bytes.length > 256 * 1024) throw new Error('Unbounded native write');
      memory.files.set(path, new Blob([bytes])); return { uri: 'file://' + path };
    }),
    appendFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      if (memory.rejectAppend) throw new Error('Disk full');
      const bytes = Buffer.from(data, 'base64'); memory.maxWrite = Math.max(memory.maxWrite, bytes.length);
      if (bytes.length > 256 * 1024) throw new Error('Unbounded native append');
      memory.files.set(path, new Blob([memory.files.get(path)!, bytes]));
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => { memory.files.delete(path); }),
    getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: 'file://' + path })),
    rename: vi.fn(async ({ from, to }: { from: string; to: string }) => { if (memory.rejectMove) throw new Error('Storage unavailable'); memory.files.set(to, memory.files.get(from)!); memory.files.delete(from); }),
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
import { readFile, writeFile, exportFile } from './storage';
beforeEach(() => { memory.files.clear(); memory.rejectMove = false; memory.rejectAppend = false; memory.shortRead = false; memory.maxRead = 0; memory.maxWrite = 0; });

describe('Android interrupted-write recovery', () => {
  it('recovers a completed pending index instead of presenting an empty library', async () => {
    memory.files.set('library/library.json.pending', new Blob(['{"games":[1]}']));
    expect(new TextDecoder().decode((await readFile('library.json'))!)).toBe('{"games":[1]}');
    expect(memory.files.has('library/library.json')).toBe(true); expect(memory.files.has('library/library.json.pending')).toBe(false);
  });
  it('keeps the committed copy when an incomplete newer write is also present', async () => {
    memory.files.set('library/library.json', new Blob(['committed'])); memory.files.set('library/library.json.writing', new Blob(['partial']));
    expect(new TextDecoder().decode((await readFile('library.json'))!)).toBe('committed');
  });
  it('retains recovery data and reports failure when the recovery move cannot complete', async () => {
    memory.files.set('library/library.json.pending', new Blob(['recovery'])); memory.rejectMove = true;
    await expect(readFile('library.json')).rejects.toThrow('Storage unavailable'); expect(memory.files.has('library/library.json.pending')).toBe(true);
  });
  it('does not recover a killed, partially appended import', async () => {
    memory.files.set('library/roms/test.nds.writing', new Blob(['partial']));
    expect(await readFile('roms/test.nds')).toBeNull();
  });
  it('keeps the old file and removes a partial write if a chunk fails', async () => {
    memory.files.set('library/test', new Blob(['committed'])); memory.rejectAppend = true;
    await expect(writeFile('test', new Uint8Array(300000))).rejects.toThrow('Disk full');
    expect(new TextDecoder().decode((await readFile('test'))!)).toBe('committed');
    expect(memory.files.has('library/test.writing')).toBe(false); expect(memory.files.has('library/test.pending')).toBe(false);
  });
});
describe('bounded Android binary transfers', () => {
  it('round trips a 64 MB ROM and uneven final chunk without a whole-file bridge message', async () => {
    const bytes = new Uint8Array(64 * 1024 * 1024 + 17);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >>> 16)) & 255;
    await writeFile('roms/large.nds', bytes);
    const restored = await readFile('roms/large.nds');
    expect(Buffer.from(restored!).equals(Buffer.from(bytes))).toBe(true);
    expect(memory.maxWrite).toBe(256 * 1024); expect(memory.maxRead).toBe(256 * 1024);
    expect([...memory.files.keys()]).toEqual(['library/roms/large.nds']);
  }, 30000);
  it('supports empty files without an unbounded EOF read', async () => {
    await writeFile('empty', new Uint8Array()); expect(await readFile('empty')).toEqual(new Uint8Array()); expect(memory.maxRead).toBe(0);
  });
  it('rejects a truncated chunk instead of silently padding it', async () => {
    await writeFile('test', new Uint8Array(17)); memory.shortRead = true;
    await expect(readFile('test')).rejects.toThrow('incomplete');
  });
  it('exports a backup using bounded blob slices', async () => {
    const { Share } = await import('@capacitor/share');
    await exportFile(new Blob([new Uint8Array(600001)]), 'backup.zip');
    expect(memory.files.get('exports/backup.zip')?.size).toBe(600001);
    expect(memory.maxWrite).toBe(256 * 1024); expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file://exports/backup.zip'] }));
  });
});
