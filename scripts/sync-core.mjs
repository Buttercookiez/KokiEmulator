import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules', '@wasm-gaming', 'mgba-wasm');
const destination = path.join(root, 'public', 'vendor', 'mgba');
const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (pkg.version !== '0.1.1') {
  throw new Error(`The tested emulator is @wasm-gaming/mgba-wasm@0.1.1; found ${pkg.version}.`);
}
await mkdir(destination, { recursive: true });
await Promise.all(['mgba.js', 'mgba.wasm'].map((name) => copyFile(path.join(source, 'dist', 'mgba', name), path.join(destination, name))));
await copyFile(path.join(root, 'licenses', 'MPL-2.0.txt'), path.join(destination, 'LICENSE.txt'));
await copyFile(path.join(root, 'docs', 'EMULATOR-CORE.md'), path.join(destination, 'NOTICE.md'));
console.log('Bundled mGBA core 0.1.1 locally (no CDN or network needed at runtime).');
