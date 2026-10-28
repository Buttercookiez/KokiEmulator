// Original, tiny GBA homebrew diagnostic. No commercial game or BIOS data.
// Displays green, red while A is held; top-row markers expose D-pad input.
// Writes 0x4b into SRAM on each pass.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIAGNOSTIC_DPAD_PIXELS = { up: { x: 8, y: 0 }, down: { x: 10, y: 0 }, left: { x: 12, y: 0 }, right: { x: 14, y: 0 } };
export function makeDiagnosticRom() {
  const rom = new Uint8Array(32768);
  const view = new DataView(rom.buffer);
  view.setUint32(0, 0xea00002e, true); // b 0x080000c0
  rom.set(new TextEncoder().encode('KOKI TEST'), 0xa0);
  rom.set(new TextEncoder().encode('KOKI00'), 0xac);
  rom[0xb2] = 0x96;
  let checksum = -0x19;
  for (let i = 0xa0; i <= 0xbc; i++) checksum -= rom[i];
  rom[0xbd] = checksum & 255;
  const instructions = [], literals = [], labels = new Map(), branches = [];
  const emit = value => instructions.push(value >>> 0);
  const label = name => labels.set(name, instructions.length);
  const ldr = (register, value, condition = 14) => { literals.push({ index: instructions.length, register, value, condition }); emit(0); };
  const branch = (name, condition = 14) => { branches.push({ index: instructions.length, name, condition }); emit(0); };
  ldr(0, 0x04000000); ldr(1, 0x0403); emit(0xe5801000); // Mode 3 + BG2.
  ldr(0, 0x0e000000); emit(0xe3a0304b); emit(0xe5c03000); // Initialize SRAM before a partial first frame can be saved.
  label('outer');
  ldr(0, 0x04000130); emit(0xe1d010b0); emit(0xe3110001); // Read active-low A.
  ldr(1, 0x001f001f, 0); ldr(1, 0x03e003e0, 1); // Red / green.
  ldr(0, 0x060003c0); ldr(2, 18960); // Leave two marker rows outside the background fill.
  label('fill'); emit(0xe4801004); emit(0xe2522001); branch('fill', 1);
  ldr(0, 0x04000130); emit(0xe1d030b0); // Read all active-low key bits into r3.
  for (const [button, mask] of [['up', 0x40], ['down', 0x80], ['left', 0x20], ['right', 0x10]]) {
    emit(0xe3130000 | mask); // TST r3, #key mask.
    ldr(1, 0x7fff7fff, 0); ldr(1, 0, 1); // Held white, released black.
    ldr(0, 0x06000000 + DIAGNOSTIC_DPAD_PIXELS[button].x * 2); emit(0xe5801000);
  }
  ldr(0, 0x0e000000); emit(0xe3a0304b); emit(0xe5c03000); // STRB 'K' to SRAM.
  branch('outer');
  branches.forEach(({ index, name, condition }) => instructions[index] = ((condition << 28) | 0x0a000000 | ((labels.get(name) - index - 2) & 0x00ffffff)) >>> 0);
  const pool = instructions.length;
  literals.forEach(({ index, register, value, condition }, offset) => { const displacement = (pool + offset - index - 2) * 4; instructions[index] = ((condition << 28) | 0x059f0000 | (register << 12) | displacement) >>> 0; instructions.push(value); });
  instructions.forEach((word, index) => view.setUint32(0xc0 + index * 4, word, true));
  rom.set(new TextEncoder().encode('SRAM_V113'), 0x400);
  return rom;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = path.join(root, '.cache/test-rom/koki-diagnostic.gba');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, makeDiagnosticRom());
  console.log(destination);
}
