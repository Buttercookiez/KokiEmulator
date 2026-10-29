import { deflateSync, inflateSync } from 'fflate';
const RAW = new TextEncoder().encode('KOKINDS1');
const PACKED = new TextEncoder().encode('KOKINDSZ');
const LIMIT = 64 * 1024 * 1024;
const matches = (value: Uint8Array, magic: Uint8Array) => magic.every((byte, i) => value[i] === byte);
export function packNdsCheckpoint(raw: Uint8Array): Uint8Array {
  if (raw.length < 32 || raw.length > LIMIT || !matches(raw, RAW)) throw new Error('Invalid DS checkpoint.');
  const packed = deflateSync(raw, { level: 1 });
  const result = new Uint8Array(12 + packed.length);
  result.set(PACKED); new DataView(result.buffer).setUint32(8, raw.length, true); result.set(packed, 12);
  return result;
}
export function unpackNdsCheckpoint(bytes: Uint8Array): Uint8Array {
  if (bytes.length > LIMIT) throw new Error('The DS checkpoint is too large.');
  if (matches(bytes, RAW)) return bytes;
  if (bytes.length < 13 || !matches(bytes, PACKED)) throw new Error('This checkpoint uses the earlier DS engine. It remains in history; use an in-game save with this preview.');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (length < 32 || length > LIMIT) throw new Error('Invalid DS checkpoint size.');
  const raw = inflateSync(bytes.subarray(12), { out: new Uint8Array(length) });
  if (!matches(raw, RAW)) throw new Error('The DS checkpoint is damaged.');
  return raw;
}
