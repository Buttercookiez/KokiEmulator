import { describe, it, expect } from 'vitest';
import { packNdsCheckpoint, unpackNdsCheckpoint } from './nds-checkpoint';
const raw = () => { const bytes = new Uint8Array(512 * 1024); bytes.set(new TextEncoder().encode('KOKINDS1')); bytes[400] = 99; return bytes; };
describe('NDS checkpoint storage', () => {
  it('compresses checkpoints and restores every byte', () => { const bytes = raw(), packed = packNdsCheckpoint(bytes); expect(packed.length).toBeLessThan(bytes.length / 10); expect(unpackNdsCheckpoint(packed)).toEqual(bytes); });
  it('preserves raw snapshots used by bounded rewind', () => { const bytes = raw(); expect(unpackNdsCheckpoint(bytes)).toBe(bytes); });
  it('rejects an older engine state without modifying it', () => { const bytes = new Uint8Array(200), before = bytes.slice(); expect(() => unpackNdsCheckpoint(bytes)).toThrow(/earlier DS engine/); expect(bytes).toEqual(before); });
  it('rejects forged decompressed sizes before allocating', () => { const packed = packNdsCheckpoint(raw()); new DataView(packed.buffer).setUint32(8, 65 * 1024 * 1024, true); expect(() => unpackNdsCheckpoint(packed)).toThrow(/size/); });
  it('rejects damaged compressed data', () => { const packed = packNdsCheckpoint(raw()); packed.fill(255, 12); expect(() => unpackNdsCheckpoint(packed)).toThrow(); });
});
