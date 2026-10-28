import { beforeEach, describe, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => ({ files: new Map<string, string>(), rejectMove: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE' },
  Filesystem: {
    readFile: vi.fn(async ({ path }: { path: string }) => { if (!memory.files.has(path)) throw new Error('File does not exist'); return { data: memory.files.get(path)! }; }),
    rename: vi.fn(async ({ from, to }: { from: string; to: string }) => { if (memory.rejectMove) throw new Error('Storage unavailable'); memory.files.set(to, memory.files.get(from)!); memory.files.delete(from); }),
  },
}));
import { readFile } from './storage';
beforeEach(() => { memory.files.clear(); memory.rejectMove = false; });
describe('Android interrupted-write recovery', () => {
  it('recovers a completed pending index instead of presenting an empty library', async () => {
    memory.files.set('library/library.json.pending', btoa('{"games":[1]}'));
    expect(new TextDecoder().decode((await readFile('library.json'))!)).toBe('{"games":[1]}');
    expect(memory.files.has('library/library.json')).toBe(true); expect(memory.files.has('library/library.json.pending')).toBe(false);
  });
  it('keeps the committed copy when an incomplete newer write is also present', async () => {
    memory.files.set('library/library.json', btoa('committed')); memory.files.set('library/library.json.pending', btoa('partial'));
    expect(new TextDecoder().decode((await readFile('library.json'))!)).toBe('committed');
  });
  it('retains recovery data and reports failure when the recovery move cannot complete', async () => {
    memory.files.set('library/library.json.pending', btoa('recovery')); memory.rejectMove = true;
    await expect(readFile('library.json')).rejects.toThrow('Storage unavailable'); expect(memory.files.has('library/library.json.pending')).toBe(true);
  });
});
