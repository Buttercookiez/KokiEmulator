import fs from 'node:fs/promises';
export function makeNdsDiagnostic() {
    const b = new Uint8Array(65536), v = new DataView(b.buffer);
    b.set(new TextEncoder().encode('KOKI DS TEST'), 0);
    b.set(new TextEncoder().encode('KDS0'), 12);
    b.set(new TextEncoder().encode('00'), 16);
    b[0x14] = 0;
    b[0x1e] = 4;
    for (const [o, n] of [[0x20, 0x200], [0x24, 0x02000000], [0x28, 0x02000000], [0x2c, 0x200], [0x30, 0x400], [0x34, 0x03800000], [0x38, 0x03800000], [0x3c, 0x100], [0x80, b.length], [0x84, 0x200]])
        v.setUint32(o, n, true);
    const code = [], pool = [], labels = new Map(), branches = [];
    const emit = n => code.push(n >>> 0), ldr = (r, n, cond = 14) => { pool.push({ i: code.length, r, n, cond }); emit(0); }, label = n => labels.set(n, code.length), branch = (n, c = 14) => { branches.push({ i: code.length, n, c }); emit(0); };
    ldr(0, 0x04000304);
    ldr(1, 0x820f);
    emit(0xe1c010b0);
    ldr(0, 0x04000240);
    ldr(1, 0x80);
    emit(0xe5c01000);
    ldr(0, 0x04000242);
    ldr(1, 0x84);
    emit(0xe5c01000);
    ldr(0, 0x04000000);
    ldr(1, 0x00020000);
    emit(0xe5801000);
    ldr(0, 0x04001000);
    ldr(1, 0x00010405);
    emit(0xe5801000);
    ldr(0, 0x0400100c);
    ldr(1, 0x4084);
    emit(0xe1c010b0);
    for (const p of [0x04001020, 0x04001026]) {
        ldr(0, p);
        ldr(1, 256);
        emit(0xe1c010b0);
    }
    ldr(0, 0x06200000);
    ldr(1, 0x83e083e0);
    ldr(2, 32768);
    label('bottom');
    emit(0xe4801004);
    emit(0xe2522001);
    branch('bottom', 1);
    label('loop');
    ldr(0, 0x04000130);
    emit(0xe1d010b0);
    emit(0xe3110001);
    ldr(1, 0x801f801f, 0);
    ldr(1, 0xfc00fc00, 1);
    ldr(0, 0x06800000);
    ldr(2, 24576);
    label('top');
    emit(0xe4801004);
    emit(0xe2522001);
    branch('top', 1);
    branch('loop');
    for (const { i, n, c } of branches)
        code[i] = ((c << 28) | 0x0a000000 | ((labels.get(n) - i - 2) & 0xffffff)) >>> 0;
    const start = code.length;
    for (const { i, r, n, cond } of pool) {
        code[i] = ((cond << 28) | 0x059f0000 | (r << 12) | ((start + code.length - start - start - i - 2) * 4)) >>> 0;
        code.push(n);
    }
    // Resolve each literal against the final instruction pool location.
    for (let k = 0; k < pool.length; k++) {
        const { i, r, cond } = pool[k];
        code[i] = ((cond << 28) | 0x059f0000 | (r << 12) | ((start + k - i - 2) * 4)) >>> 0;
    }
    code.forEach((n, i) => v.setUint32(0x200 + i * 4, n, true));
    v.setUint32(0x400, 0xeafffffe, true);
    const crc = (a, z) => { let c = 0xffff; for (let i = a; i < z; i++) {
        c ^= b[i];
        for (let n = 0; n < 8; n++)
            c = (c >>> 1) ^ ((c & 1) ? 0xa001 : 0);
    } return c; };
    v.setUint16(0x15c, crc(0xc0, 0x15c), true);
    v.setUint16(0x15e, crc(0, 0x15e), true);
    return b;
}
if (process.argv[1]?.endsWith('make-nds-diagnostic.mjs')) {
    await fs.mkdir('.cache/nds-tests', { recursive: true });
    await fs.writeFile('.cache/nds-tests/koki-ds-diagnostic.nds', makeNdsDiagnostic());
    console.log('Original dual-screen DS input diagnostic generated.');
}
