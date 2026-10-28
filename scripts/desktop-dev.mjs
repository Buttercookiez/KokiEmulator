import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const port = Number(process.env.KOKI_DEV_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid development port.');
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit', windowsHide: true });
let desktop;
let stopped = false;
function stop() { if (stopped) return; stopped = true; desktop?.kill(); vite.kill(); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
process.once('exit', stop);
vite.on('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; });

try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && vite.exitCode === null && !stopped) {
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); ready = response.ok; } catch { /* Vite is still starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('The local UI development server did not start.');
  const environment = { ...process.env, KOKI_DEV_URL: origin };
  delete environment.ELECTRON_RUN_AS_NODE;
  desktop = spawn(require('electron'), [root], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
  desktop.once('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; });
  desktop.once('exit', (code) => { stop(); process.exitCode = code || 0; });
} catch (error) { console.error(error.message); stop(); process.exitCode = 1; }
