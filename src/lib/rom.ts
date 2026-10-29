import { IS_NDS } from '../platform';
import { inspectNdsRom, NDS_ROM_LIMIT } from './nds-rom';
export const MAX_ROM_SIZE = IS_NDS ? NDS_ROM_LIMIT : 32 * 1024 * 1024;
export function inspectRom(bytes: Uint8Array, fileName: string): { title: string; code: string } {
  if (IS_NDS) return inspectNdsRom(bytes,fileName);
  if (bytes.length < 192 || bytes.length > MAX_ROM_SIZE) throw new Error(`${fileName}: a GBA game must be between 192 bytes and 32 MB.`);
  if (bytes[0xb2] !== 0x96) throw new Error(`${fileName}: this file does not have a valid GBA header.`);
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) checksum = (checksum - bytes[i]) & 255;
  checksum = (checksum - 0x19) & 255;
  if (checksum !== bytes[0xbd]) throw new Error(`${fileName}: the GBA header checksum is invalid. The file may be damaged.`);
  const headerTitle = new TextDecoder().decode(bytes.subarray(0xa0, 0xac)).replace(/\0/g, '').trim();
  const friendlyName = fileName.replace(/\.(gba|bin)$/i, '').replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
  const code = new TextDecoder().decode(bytes.subarray(0xac, 0xb0)).replace(/[^a-zA-Z0-9]/g, '');
  return { title: (friendlyName || headerTitle || 'Untitled game').slice(0, 150), code };
}
export async function romHash(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes.slice();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
}
