import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeDiagnosticRom, DIAGNOSTIC_DPAD_PIXELS } from './make-diagnostic-rom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.cache/test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.KOKI_TEST_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Add your first game', exact: true }).waitFor();
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles({ name: 'Keyboard diagnostic.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDiagnosticRom()) });
  await page.getByRole('button', { name: 'Play Keyboard diagnostic', exact: true }).click();
  const screen = page.locator('.player-screen-wrap canvas');
  const showChrome = async () => { await page.mouse.move(30, 30); await page.mouse.move(45, 35); };
  const dpad = async (button, held) => page.waitForFunction(({ position, held }) => {
    const canvas = document.querySelector('.player-screen-wrap canvas');
    if (!canvas) return false;
    const pixel = canvas.getContext('2d').getImageData(position.x, position.y, 1, 1).data;
    return held ? pixel[0] > 200 && pixel[1] > 200 && pixel[2] > 200 : pixel[0] < 20 && pixel[1] < 20 && pixel[2] < 20;
  }, { position: DIAGNOSTIC_DPAD_PIXELS[button], held });
  const pressDirection = async (button, key) => { await page.keyboard.down(key); await dpad(button, true); await page.keyboard.up(key); await dpad(button, false); };
  const color = async value => page.waitForFunction(target => {
    const canvas = document.querySelector('.player-screen-wrap canvas');
    if (!canvas) return false;
    const pixel = canvas.getContext('2d').getImageData(120, 80, 1, 1).data;
    return target === 'red' ? pixel[0] > 200 && pixel[1] < 20 : pixel[1] > 200 && pixel[0] < 20;
  }, value, { timeout: 30_000 });
  const focusOnScreen = () => page.waitForFunction(() => document.activeElement?.matches('.player-screen-wrap canvas'));
  const pressA = async (key = 'x') => { await page.keyboard.down(key); await color('red'); await page.keyboard.up(key); await color('green'); };
  const frames = () => page.evaluate(() => new Promise(resolve => { let count = 0; const frame = () => ++count === 5 ? resolve() : requestAnimationFrame(frame); requestAnimationFrame(frame); }));
  await color('green');
  await focusOnScreen();
  await pressA();

  for (const [button, letter, arrow] of [
    ['up', 'w', 'ArrowUp'], ['down', 's', 'ArrowDown'], ['left', 'a', 'ArrowLeft'], ['right', 'd', 'ArrowRight'],
  ]) {
    await pressDirection(button, letter); await pressDirection(button, arrow);
    await page.keyboard.down(letter); await page.keyboard.down(arrow); await dpad(button, true);
    await page.keyboard.up(letter); await frames(); await dpad(button, true);
    await page.keyboard.up(arrow); await dpad(button, false);
  }
  await page.keyboard.down('w'); await page.keyboard.down('d');
  await dpad('up', true); await dpad('right', true);
  await page.keyboard.up('w'); await dpad('up', false); await dpad('right', true);
  await page.keyboard.up('d'); await dpad('right', false);
  await page.keyboard.down('x'); await page.keyboard.down('j'); await color('red');
  await page.keyboard.up('x'); await frames(); await color('red');
  await page.keyboard.up('j'); await color('green');
  await page.keyboard.down('w'); await dpad('up', true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await dpad('up', false); await page.keyboard.up('w');
  await showChrome();

  const speed = page.getByRole('combobox', { name: 'Playback speed', exact: true });
  await showChrome();
  await speed.click();
  await page.getByRole('option', { name: '2×', exact: true }).click();
  await focusOnScreen();
  assert.equal(await speed.innerText(), '2×');
  await pressA();

  await showChrome();
  await speed.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.down('x');
  await frames();
  await color('green');
  await page.keyboard.up('x');
  await page.keyboard.press('Escape');
  await focusOnScreen();
  assert.equal(await speed.innerText(), '2×', 'Escape must cancel the highlighted speed without closing the game');
  await pressA();
  await showChrome();
  await speed.click();
  await showChrome();
  await speed.click();
  await focusOnScreen();
  await pressA();

  await page.keyboard.down('x');
  await color('red');
  await showChrome();
  await page.getByRole('button', { name: 'Pause Space', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await focusOnScreen();
  await color('green');
  await page.keyboard.up('x');
  await pressA();

  await page.keyboard.down('x');
  await color('red');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await color('green');
  await page.keyboard.up('x');
  await pressA();

  const volume = page.getByRole('slider', { name: 'Volume', exact: true });
  await showChrome();
  await volume.focus();
  const beforeVolume = Number(await volume.inputValue());
  await page.keyboard.press('ArrowLeft');
  assert(Number(await volume.inputValue()) < beforeVolume, 'Volume slider retains keyboard arrow adjustments');
  await pressA();
  await screen.click();
  await focusOnScreen();

  await showChrome();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  const checkpoint = page.getByLabel('New checkpoint', { exact: true });
  await checkpoint.fill('xz checkpoint');
  assert.equal(await checkpoint.inputValue(), 'xz checkpoint', 'Game bindings must not intercept checkpoint text entry');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await focusOnScreen();
  await pressA();

  await showChrome();
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await page.locator('.player-shell').waitFor({ state: 'detached' });
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Change A key, currently X', exact: true }).click();
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'Change A key, currently C', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Change Up key, currently W', exact: true }).click();
  await page.keyboard.press('i');
  await page.getByRole('button', { name: 'Change Up key, currently I', exact: true }).waitFor();
  await page.locator('.sidebar').getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await color('green');
  await focusOnScreen();
  await pressA('c');
  await page.keyboard.down('x');
  await frames();
  await color('green');
  await page.keyboard.up('x');
  await pressDirection('up', 'i');
  await pressDirection('up', 'ArrowUp');
  await showChrome();
  assert((await page.getByLabel('Keyboard controls', { exact: true }).textContent()).includes('C A'), 'The legend must reflect the remapped A key');
  await showChrome();
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await page.locator('.player-shell').waitFor({ state: 'detached' });
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Change A key, currently C', exact: true }).click();
  await page.keyboard.press('w');
  await page.getByRole('button', { name: 'Change A key, currently W', exact: true }).waitFor();
  await page.locator('.sidebar').getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await color('green'); await focusOnScreen();
  await page.keyboard.down('w'); await color('red'); await dpad('up', false);
  await page.keyboard.up('w'); await color('green');
  await pressDirection('up', 'i');
  await pressDirection('up', 'ArrowUp');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'keyboard-player.png') });
  const report = { keyboard: 'passed', initialScreenFocus: 'passed', speedSelectionFocus: 'passed', dropdownEscapeAndToggle: 'passed', dropdownDoesNotSendGameKeys: 'passed', pausedHeldKeyCleanup: 'passed', blurHeldKeyCleanup: 'passed', volumeKeyboardAndGameplay: 'passed', textEntry: 'passed', directions: 'WASD + all four arrows', simultaneousDirections: 'passed', heldDirectionAliases: 'passed', heldActionAliases: 'passed', blurDirectionCleanup: 'passed', remapping: 'X→C, Up→I, A→W explicit alias conflict', visibleBindings: 'passed', browserErrors: errors };
  await writeFile(path.join(output, 'keyboard-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'keyboard-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
