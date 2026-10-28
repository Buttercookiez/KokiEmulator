import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeDiagnosticRom } from './make-diagnostic-rom.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { throw new Error('Install Playwright to run this browser integration check.'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.KOKI_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__core-test', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Koki core integration check</title><canvas id="game"></canvas>' }));
  await page.goto(`${base}/__core-test`);
  await page.evaluate(async (bytes) => {
    const { GbaEmulator } = await import('/src/lib/emulator.ts');
    const canvas = document.getElementById('game');
    window.coreCheck = { stats: [], runtimeErrors: [], canvas };
    const engine = new GbaEmulator(canvas, {
      onStats: (stats) => window.coreCheck.stats.push(stats),
      onError: (error) => window.coreCheck.runtimeErrors.push(error.message),
    });
    window.coreCheck.engine = engine;
    await engine.load(new Uint8Array(bytes));
    engine.setVolume(0);
    engine.setRewindSeconds(2);
    engine.play();
  }, Array.from(makeDiagnosticRom()));
  const pixel = () => page.evaluate(() => Array.from(window.coreCheck.canvas.getContext('2d').getImageData(120, 80, 1, 1).data));
  await page.waitForTimeout(450);
  const green = await pixel();
  assert(green[1] > 200 && green[0] < 20, `Expected diagnostic green, received ${green}`);
  await page.evaluate(() => window.coreCheck.engine.setButton('a', true));
  await page.waitForTimeout(150);
  const red = await pixel();
  assert(red[0] > 200 && red[1] < 20, `Expected red with A held, received ${red}`);
  const stateSize = await page.evaluate(() => {
    const check = window.coreCheck;
    check.savedState = check.engine.saveState();
    check.engine.setButton('a', false);
    return check.savedState.length;
  });
  assert(stateSize > 100_000, 'Expected an actual mGBA serialized state');
  await page.waitForTimeout(100);
  await page.evaluate(() => { const check = window.coreCheck; check.engine.pause(); check.engine.loadState(check.savedState); });
  await page.evaluate(() => window.coreCheck.engine.play());
  await page.waitForTimeout(100);
  await page.evaluate(() => window.coreCheck.engine.pause());
  const restored = await pixel();
  assert(restored[1] > 200 && restored[0] < 20, 'Loading a state must not leave its old A button stuck');
  const save = await page.evaluate(() => {
    const engine = window.coreCheck.engine;
    const bytes = engine.exportSave();
    if (!bytes) return null;
    bytes[0] = 0x33;
    bytes[100] = 0x99;
    engine.importSave(bytes);
    const roundTrip = engine.exportSave();
    engine.reset();
    const afterReset = engine.exportSave();
    return { length: bytes.length, first: roundTrip[0], afterReset: afterReset[100] };
  });
  assert(save && save.length === 32768 && save.first === 0x33 && save.afterReset === 0x99, `SRAM round-trip/reset failed: ${JSON.stringify(save)}`);
  const rejectedState = await page.evaluate(() => { try { window.coreCheck.engine.loadState(new Uint8Array(8)); return false; } catch { return true; } });
  assert(rejectedState, 'Malformed save states must be rejected');
  await page.evaluate(() => { const engine = window.coreCheck.engine; engine.setSpeed(2); engine.play(); });
  await page.waitForTimeout(1500);
  const fast = await page.evaluate(() => window.coreCheck.stats.at(-1));
  assert(fast.fps > 80, `Fast-forward did not advance enough frames: ${JSON.stringify(fast)}`);
  assert(fast.rewindSeconds > 0 && fast.rewindSeconds <= 2, 'Bounded rewind history was not captured');
  await page.evaluate(() => window.coreCheck.engine.setRewinding(true));
  await page.waitForTimeout(450);
  await page.evaluate(() => { const engine = window.coreCheck.engine; engine.setRewinding(false); engine.setSpeed(1); engine.pause(); });
  const screenshot = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await window.coreCheck.engine.screenshot()).arrayBuffer());
    return Array.from(bytes.subarray(0, 8));
  });
  assert.deepEqual(screenshot, [137, 80, 78, 71, 13, 10, 26, 10], 'Screenshot is not a PNG');
  const output = path.join(root, '.cache', 'test-results');
  await mkdir(output, { recursive: true });
  await page.locator('#game').screenshot({ path: path.join(output, 'emulator-diagnostic.png') });
  const runtime = await page.evaluate(() => { const check = window.coreCheck; check.engine.destroy(); return { loaded: check.engine.loaded, running: check.engine.isRunning, errors: check.runtimeErrors }; });
  assert(!runtime.loaded && !runtime.running && runtime.errors.length === 0, `Emulator cleanup or runtime failed: ${JSON.stringify(runtime)}`);
  const batteryBoot = await page.evaluate(async rom => {
    const { GbaEmulator } = await import('/src/lib/emulator.ts');
    const results = {};
    for (const mode of ['cold', 'checkpoint']) {
      const engine = new GbaEmulator(document.createElement('canvas'));
      const battery = new Uint8Array(32768).fill(0xa5);
      battery[100] = 0x99;
      try {
        await engine.load(new Uint8Array(rom), battery, mode === 'checkpoint' ? window.coreCheck.savedState : undefined);
        results[mode] = engine.exportSave()?.[100];
      } finally { engine.destroy(); }
    }
    return results;
  }, Array.from(makeDiagnosticRom()));
  assert.deepEqual(batteryBoot, { cold: 0x99, checkpoint: 0x99 }, 'Fresh-core battery imports must survive cold boot and checkpoint resume');
  assert.deepEqual(errors, [], 'Browser exceptions occurred');
  console.log(JSON.stringify({ diagnostic: 'passed', green, red, stateSize, batterySave: save, freshCoreBatteryImports: batteryBoot, fastForward: fast, rewind: 'passed', png: 'passed', destroyed: true, browserErrors: errors }));
} finally {
  await browser.close();
}
