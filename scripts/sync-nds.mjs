import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'engines/nds-manifest.json'), 'utf8'));
const target = path.join(root, 'engines/nds');
await fs.mkdir(target, { recursive: true });
for (const item of manifest.artifacts) {
    const file = path.join(target, item.file);
    let bytes;
    try {
        bytes = await fs.readFile(file);
    }
    catch { }
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
        const r = await fetch(item.url);
        if (!r.ok)
            throw Error('DS engine download failed: ' + r.status);
        bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256)
            throw Error('DS engine integrity check failed');
        await fs.writeFile(file, bytes);
    }
}
const staged = path.join(root, '.cache/nds-public-source');
await fs.mkdir(staged, { recursive: true });
await fs.cp(path.join(root, 'public/brand'), path.join(staged, 'brand'), { recursive: true });
await fs.mkdir(path.join(staged, 'vendor/nds'), { recursive: true });
for (const item of manifest.artifacts)
    await fs.copyFile(path.join(target, item.file), path.join(staged, 'vendor/nds', item.file));
await fs.copyFile(path.join(root, 'engines/nds-manifest.json'), path.join(staged, 'vendor/nds/PROVENANCE.json'));
await fs.copyFile(path.join(root,'engines/nds-source-manifest.json'),path.join(staged,'vendor/nds/SOURCE-MANIFEST.json'));
await fs.copyFile(path.join(root,'docs/NDS-CORE.md'),path.join(staged,'vendor/nds/BUILDING.md'));
await fs.mkdir(path.join(staged,'vendor/nds-native'),{recursive:true});
await fs.cp(path.join(root,'licenses/nds-native'),path.join(staged,'vendor/nds-native'),{recursive:true});
await fs.copyFile(path.join(root,'native/nds/manifest.json'),path.join(staged,'vendor/nds-native/PROVENANCE.json'));
await fs.copyFile(path.join(root,'docs/NDS-NATIVE.md'),path.join(staged,'vendor/nds-native/BUILDING.md'));
console.log('Pinned source-built SkyEmu DS core verified; no runtime downloads.');
