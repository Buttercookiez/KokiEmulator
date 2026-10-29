import { describe, it, expect } from 'vitest';
import { inspectNdsRom } from './nds-rom';
import { dsTouchPoint } from './nds-emulator';
function header() { const b = new Uint8Array(1024), v = new DataView(b.buffer); for (const [base, offset, ram] of [[32, 512, 0x02000000], [48, 768, 0x03800000]]) {
    v.setUint32(base, offset, true);
    v.setUint32(base + 4, ram, true);
    v.setUint32(base + 8, ram, true);
    v.setUint32(base + 12, 256, true);
} return b; }
describe('DS ROM validation', () => { it('accepts a bounded homebrew executable without requiring a proprietary logo', () => expect(inspectNdsRom(header(), 'Example.nds').title).toBe('Example')); it('rejects renamed GBA and truncated executables', () => { expect(() => inspectNdsRom(new Uint8Array(1024), 'fake.nds')).toThrow(); const b = header(); new DataView(b.buffer).setUint32(60, 1024, true); expect(() => inspectNdsRom(b, 'broken.nds')).toThrow(); }); });
describe('DS touchscreen mapping', () => { it('maps only the lower panel and handles swaps', () => { expect(dsTouchPoint(128, 288, 256, 384, 'vertical', false)).toEqual([128, 96]); expect(dsTouchPoint(128, 96, 256, 384, 'vertical', false)).toBeNull(); expect(dsTouchPoint(128, 96, 256, 384, 'vertical', true)).toEqual([128, 96]); }); it('maps horizontal and lower-only displays', () => { expect(dsTouchPoint(384, 96, 512, 192, 'horizontal', false)).toEqual([128, 96]); expect(dsTouchPoint(128, 96, 512, 192, 'horizontal', false)).toBeNull(); expect(dsTouchPoint(128, 96, 256, 192, 'bottom', true)).toEqual([128, 96]); }); it('accounts for letterboxing and top/bottom alignment', () => { expect(dsTouchPoint(128, 288, 256, 600, 'vertical', false, 'top')).toEqual([128, 96]); expect(dsTouchPoint(128, 504, 256, 600, 'vertical', false, 'bottom')).toEqual([128, 96]); expect(dsTouchPoint(128, 396, 256, 600, 'vertical', false)).toEqual([128, 96]); expect(dsTouchPoint(-1, 250, 256, 384, 'vertical', false)).toBeNull(); }); });
