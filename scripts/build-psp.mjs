import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.resolve(process.env.KOKI_PSP_RUNTIME || path.join(root, '.cache', 'psp-runtime'));
process.env.KOKI_PSP_RUNTIME = path.relative(root, runtime);
const runtimeFiles = ['python/python.exe', 'core/ppsspp_libretro.dll', 'system/PPSSPP/compat.ini'];
for (const file of process.argv.includes('--renderer-only') ? [] : runtimeFiles) {
  await fs.access(path.join(runtime, file)).catch(() => {
    throw new Error('Missing ' + path.join(runtime, file) + '. See docs/PSP.md.');
  });
}
await fs.mkdir(path.join(root, '.cache', 'psp-public', 'brand'), { recursive: true });
for (const file of ['koki-wordmark.svg', 'koki-symbol.svg', 'koki-app-icon.svg']) {
  await fs.copyFile(path.join(root, 'assets', 'brand', file), path.join(root, '.cache', 'psp-public', 'brand', file));
}

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(script + ' exited with code ' + code)));
  });
}
await run('node_modules/typescript/bin/tsc', ['--noEmit']);
await run('node_modules/vite/bin/vite.js', ['build', '--mode', 'psp', '--outDir', 'dist-psp']);
if (process.argv.includes('--renderer-only')) process.exit(0);
await run('scripts/generate-psp-icons.cjs', ['--windows-only']);
await run('node_modules/electron-builder/cli.js', [
  '--config', 'electron/psp-builder.json', '--win', 'portable', '--x64', '--publish', 'never',
]);
console.log(path.join(root, 'release-psp', 'Koki-PSP-0.2.0-Windows.exe'));
