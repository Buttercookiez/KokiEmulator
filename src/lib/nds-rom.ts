export const NDS_ROM_LIMIT = 512 * 1024 * 1024;
export function inspectNdsRom(bytes: Uint8Array, fileName: string) {
    if (bytes.length < 512 || bytes.length > NDS_ROM_LIMIT)
        throw Error(fileName + ': choose an NDS ROM between 512 bytes and 512 MB.');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (const base of [0x20, 0x30]) {
        const offset = v.getUint32(base, true), entry = v.getUint32(base + 4, true), ram = v.getUint32(base + 8, true), size = v.getUint32(base + 12, true);
        if (offset < 512 || !size || offset + size > bytes.length || ram < 0x01000000 || ram >= 0x04000000 || entry < 0x01000000 || entry >= 0x04000000)
            throw Error(fileName + ': invalid or truncated Nintendo DS executable header.');
    }
    const code = new TextDecoder().decode(bytes.subarray(12, 16)).replace(/[^a-zA-Z0-9]/g, '');
    const title = (fileName.replace(/\.(nds|srl)$/i, '').trim() || new TextDecoder().decode(bytes.subarray(0, 12)).replace(/\0/g, '').trim() || 'Untitled DS game').slice(0, 150);
    return { title, code };
}
