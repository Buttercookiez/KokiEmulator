import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), { extractFile } = require('@electron/asar');
const asar = 'release-nds/win-unpacked/resources/app.asar', apk = unzipSync(await fs.readFile('release-nds/Koki-NDS-0.1.0-Android.apk'));
async function list(d, p = '') { let all = []; for (const e of await fs.readdir(d, { withFileTypes: true }))
    all.push(...(e.isDirectory() ? await list(path.join(d, e.name), p + e.name + '/') : [p + e.name])); return all; }
const files = await list('dist-nds');
for (const file of files) {
    const bytes = await fs.readFile(path.join('dist-nds', file));
    assert(Buffer.from(apk['assets/public/' + file] || []).equals(bytes), 'Stale APK asset ' + file);
    assert(extractFile(asar, path.join('dist-nds', ...file.split('/'))).equals(bytes), 'Stale Windows asset ' + file);
}
assert(!files.some(n => /\.(nds|gba|map)$/.test(n)));
assert(!files.some(n => n.includes('/mgba/')));
const meta = JSON.parse(extractFile(asar, 'package.json').toString());
assert.equal(meta.kokiSystem, 'nds');
assert.equal(meta.version, '0.1.0');
const artifacts = [];
for (const file of ['Koki-NDS-0.1.0-Windows.exe', 'Koki-NDS-0.1.0-Android.apk']) {
    const b = await fs.readFile('release-nds/' + file);
    artifacts.push({ file, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') });
}
const report = { version: '0.1.0', system: 'NDS', scope: 'experimental local preview', matchingFrontendAssets: files.length, artifacts, appId: 'com.koki.nds', nativeAndroidRuntime: 'not tested', physicalDevices: 'not tested', commercialGames: 'not tested', sourceProvenance: JSON.parse(await fs.readFile('engines/nds-manifest.json', 'utf8')), webTests: JSON.parse(await fs.readFile('.cache/nds-tests/report.json', 'utf8')), nativeTests: JSON.parse(await fs.readFile('.cache/nds-tests/native-report.json', 'utf8')) };
await fs.writeFile('release-nds/BUILD-INFO.json', JSON.stringify(report, null, 2) + '\n');
await fs.writeFile('release-nds/SHA256SUMS.txt', artifacts.map(x => x.sha256 + '  ' + x.file).join('\n') + '\n');
console.log(JSON.stringify({ matchingFrontendAssets: files.length, artifacts }, null, 2));
