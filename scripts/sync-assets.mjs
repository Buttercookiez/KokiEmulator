import { mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/brand');
const destination = path.join(root, 'public/brand');
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) if (/\.(svg|png)$/i.test(name)) await copyFile(path.join(source, name), path.join(destination, name));
console.log('Prepared original Koki brand assets.');
