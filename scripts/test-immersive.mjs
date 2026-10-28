import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeDiagnosticRom } from './make-diagnostic-rom.mjs';

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
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles({ name: 'Immersive diagnostic.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDiagnosticRom()) });
  await page.getByRole('button', { name: 'Play Immersive diagnostic', exact: true }).click();
  const shell = page.locator('.player-shell');
  let screen = page.locator('.player-screen-wrap canvas');
  const color = async value => page.waitForFunction(target => {
    const canvas = document.querySelector('.player-screen-wrap canvas');
    if (!canvas) return false;
    const pixel = canvas.getContext('2d').getImageData(120, 80, 1, 1).data;
    return target === 'red' ? pixel[0] > 200 && pixel[1] < 20 : pixel[1] > 200 && pixel[0] < 20;
  }, value, { timeout: 30_000 });
  const visible = expected => page.waitForFunction(value => document.querySelector('.player-shell')?.getAttribute('data-controls-visible') === String(value), expected);
  const reveal = async () => { await page.mouse.move(40, 30); await page.mouse.move(43, 32); await visible(true); };
  const waitIdle = async () => { await screen.focus(); await page.mouse.move(700, 400); await page.waitForTimeout(2250); await visible(false); };
  const fullViewport = async () => {
    const layout = await page.evaluate(() => {
      const rect = document.querySelector('.player-screen-area').getBoundingClientRect();
      const canvas = document.querySelector('.player-screen-wrap canvas');
      const header = document.querySelector('.player-header');
      const bottom = document.querySelector('.player-bottom-chrome');
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        objectFit: getComputedStyle(canvas).objectFit, intrinsicRatio: canvas.width / canvas.height,
        headerPosition: getComputedStyle(header).position, bottomPosition: getComputedStyle(bottom).position,
        documentHeight: document.documentElement.scrollHeight, cursor: getComputedStyle(document.querySelector('.player-shell')).cursor };
    });
    assert.equal(layout.x, 0); assert.equal(layout.y, 0);
    assert.equal(layout.width, layout.viewportWidth); assert.equal(layout.height, layout.viewportHeight);
    assert.equal(layout.objectFit, 'contain'); assert.equal(layout.intrinsicRatio, 1.5);
    assert.equal(layout.headerPosition, 'absolute'); assert.equal(layout.bottomPosition, 'absolute');
    assert(layout.documentHeight <= layout.viewportHeight, 'No page overflow while playing');
    return layout;
  };
  await color('green');
  assert(await page.evaluate(() => Boolean(document.fullscreenElement)), 'Clicking Play should request real fullscreen');
  await fullViewport();
  await waitIdle();
  const hiddenLayout = await fullViewport();
  assert.equal(hiddenLayout.cursor, 'none');
  assert.equal(await page.locator('.player-header').evaluate(element => getComputedStyle(element).opacity), '0');
  assert.equal(await page.locator('.player-bottom-chrome').evaluate(element => getComputedStyle(element).opacity), '0');
  assert.equal(await shell.locator('.status-dot, .paused-pill').count(), 0, 'No idle status dots or speed pill');
  await page.screenshot({ path: path.join(output, 'immersive-idle.png') });

  // Keyboard gameplay continues while chrome is hidden.
  await page.keyboard.down('x'); await color('red');
  assert.equal(await shell.getAttribute('data-controls-visible'), 'false');
  await page.keyboard.up('x'); await color('green');
  await reveal();
  await page.getByRole('button', { name: 'Pause Space', exact: true }).click();
  await page.getByRole('heading', { name: 'Paused', exact: true }).waitFor();
  await page.waitForTimeout(2250);
  assert.equal(await shell.getAttribute('data-controls-visible'), 'true', 'Paused controls remain visible');
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await waitIdle();

  // Tab reveals the controls and keeps them present while a control has focus.
  await page.keyboard.press('Tab');
  await visible(true);
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Save and return to library', exact: true }).evaluate(element => element === document.activeElement));
  await page.waitForTimeout(2250);
  assert.equal(await shell.getAttribute('data-controls-visible'), 'true', 'Keyboard-focused controls must not vanish');
  await screen.click();
  await waitIdle();

  // A dropdown pins the controls; closing it restores focus to the game.
  await reveal();
  const speed = page.getByRole('combobox', { name: 'Playback speed', exact: true });
  await speed.click();
  await page.getByRole('listbox', { name: 'Playback speed', exact: true }).waitFor();
  await page.waitForTimeout(2250);
  assert.equal(await shell.getAttribute('data-controls-visible'), 'true', 'Open speed menu must not disappear');
  await page.keyboard.press('Escape');
  await page.getByRole('listbox', { name: 'Playback speed', exact: true }).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.matches('.player-screen-wrap canvas'));
  assert(await page.evaluate(() => Boolean(document.fullscreenElement)), 'Dropdown Escape must preserve fullscreen');
  await waitIdle();

  await reveal();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('heading', { name: 'Checkpoints', exact: true }).waitFor();
  await page.waitForTimeout(2250);
  assert.equal(await shell.getAttribute('data-controls-visible'), 'true', 'Checkpoint dialog pins controls');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();

  // Long held touch buttons remain active and visible past the idle timeout.
  await reveal();
  await page.getByRole('button', { name: 'Toggle on-screen controls', exact: true }).click();
  const touchA = page.getByRole('button', { name: 'A button', exact: true });
  const aBox = await touchA.boundingBox();
  await page.mouse.move(aBox.x + aBox.width / 2, aBox.y + aBox.height / 2);
  await page.mouse.down(); await color('red');
  await page.waitForTimeout(2400);
  assert.equal(await shell.getAttribute('data-controls-visible'), 'true', 'Holding touch controls pins chrome');
  assert(await touchA.evaluate(element => element.classList.contains('pressed')));
  await color('red');
  // Releasing a keyboard alias while touch A is held must keep A held.
  await page.keyboard.down('x'); await page.keyboard.up('x'); await color('red');
  await page.mouse.up(); await color('green');
  await waitIdle();

  // Full-window fallback keeps the same layout; fullscreen transitions clear held input.
  await reveal();
  await page.keyboard.down('x'); await color('red');
  await page.getByRole('button', { name: 'Toggle fullscreen', exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.keyboard.up('x'); await color('green');
  await fullViewport();
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await shell.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await color('green');
  assert(await page.evaluate(() => Boolean(document.fullscreenElement)), 'Resuming should enter fullscreen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await shell.count(), 1, 'Escape from fullscreen retains the running game');
  await fullViewport();
  await page.waitForTimeout(450);
  await reveal();
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await shell.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
  // Browsers may deny fullscreen; mobile still uses the full window and real touch input.
  await page.close();
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  screen = page.locator('.player-screen-wrap canvas');
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Fullscreen denied for this test', 'NotAllowedError')); });
  await page.goto(process.env.KOKI_TEST_URL || 'http://127.0.0.1:5173');
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles({ name: 'Touch diagnostic.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDiagnosticRom()) });
  await page.getByRole('button', { name: 'Play Touch diagnostic', exact: true }).click();
  await color('green');
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false, 'Fullscreen denial falls back to full-window gameplay');
  await fullViewport();
  await waitIdle();
  await page.touchscreen.tap(195, 250);
  await visible(true);
  const touchSession = await page.context().newCDPSession(page);
  const mobileA = await page.getByRole('button', { name: 'A button', exact: true }).boundingBox();
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mobileA.x + mobileA.width / 2, y: mobileA.y + mobileA.height / 2, id: 1 }] });
  await color('red');
  await page.waitForTimeout(2400);
  assert.equal(await page.locator('.player-shell').getAttribute('data-controls-visible'), 'true');
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await color('green');
  await page.setViewportSize({ width: 844, height: 390 });
  await fullViewport();
  await page.touchscreen.tap(420, 150);
  await visible(true);
  await page.screenshot({ path: path.join(output, 'immersive-mobile-landscape.png') });
  await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await page.locator('.player-shell').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-player-open')), false, 'Returning restores library scrolling');
  assert.deepEqual(errors, []);
  const report = { viewport: 'full without reserved bars', aspectRatio: '3:2 contained', autoFullscreen: 'passed', idleHideMilliseconds: 2000, mouseReveal: 'passed', pausedAndMenuVisibility: 'passed', keyboardFocusVisibility: 'passed', hiddenGameplay: 'passed', longTouchHold: 'passed', overlappingTouchAndKeyboard: 'passed', fullscreenEscape: 'passed', saveOnReturn: 'passed', mobileTouchAndLandscape: 'passed', fullscreenDeniedFallback: 'passed', browserErrors: errors };
  await writeFile(path.join(output, 'immersive-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'immersive-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }



