import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'dev';
const env = { ...process.env, KOKI_SYSTEM: 'nds' };
function run(file, args) { return new Promise((resolve, reject) => { const c = spawn(file, args, { cwd: root, env, stdio: 'inherit', windowsHide: true }); c.on('error', reject); c.on('exit', code => code === 0 ? resolve() : reject(Error(file + ' exited ' + code))); }); }
await run(process.execPath, ['scripts/sync-nds.mjs']);
if (mode === 'dev')
    await run(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'nds', '--host', '127.0.0.1', '--port', '5175', '--strictPort']);
else {
    await run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
    await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'nds', '--outDir', 'dist-nds']);
    if (mode === 'desktop')
        await run(process.execPath, ['node_modules/electron-builder/cli.js', '--config', 'electron/nds-builder.json', '--win', 'portable', '--x64']);
    else if (mode !== 'build')
        throw Error('Unknown NDS command');
}
