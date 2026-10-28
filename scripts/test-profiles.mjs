import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDiagnosticRom } from './make-diagnostic-rom.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.cache/test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1326, height: 940 }, colorScheme: 'dark' });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.KOKI_TEST_URL || 'http://127.0.0.1:5184');
  const second = makeDiagnosticRom(); second[0x700] = 3;
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles([
    { name: 'Profile Quest.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDiagnosticRom()) },
    { name: 'Default Quest.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(second) },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.game-card').length === 2);
  const color = value => page.waitForFunction(target => {
    const canvas = document.querySelector('.player-screen-wrap canvas');
    if (!canvas) return false;
    const pixel = canvas.getContext('2d').getImageData(120, 80, 1, 1).data;
    return target === 'red' ? pixel[0] > 200 && pixel[1] < 20 : pixel[1] > 200 && pixel[0] < 20;
  }, value);
  const returnToLibrary = async () => {
    if(await page.locator('.player-shell').getAttribute('data-mobile')==='true'){ if(await page.getByRole('button',{name:'Open game menu',exact:true}).isVisible())await page.getByRole('button',{name:'Open game menu',exact:true}).click(); } else { await page.locator('.player-screen-wrap canvas').focus(); await page.keyboard.press('Tab'); }
    await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
    await page.locator('.player-shell').waitFor({ state: 'detached' });
  };
  await page.getByRole('button', { name: 'View Profile Quest', exact: true }).click();
  await page.getByLabel('Use custom game profile', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Game speed', exact: true }).click();
  await page.getByRole('option', { name: '2×', exact: true }).click();
  await page.getByRole('combobox', { name: 'Game screen filter', exact: true }).click();
  await page.getByRole('option', { name: 'LCD lines', exact: true }).click();
  await page.locator('.profile-keyboard summary').click();
  await page.getByRole('button', { name: 'Change A key, currently X', exact: true }).click();
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'Change A key, currently C', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Change A key, currently C', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Game details', exact: true }).count(), 1, 'Escape cancels remapping without closing the profile editor');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'View Profile Quest', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: 'Game speed', exact: true }).textContent(), '2×');
  assert.equal(await page.getByRole('combobox', { name: 'Game screen filter', exact: true }).textContent(), 'LCD lines');
  await page.screenshot({ path: path.join(output, 'profile-desktop.png') });
  await page.getByRole('button', { name: 'Play game', exact: true }).click();
  await color('green');
  assert.equal(await page.locator('.filter-lcd').count(), 1);
  assert.equal(await page.locator('.player-speed').textContent(), '2×');
  await page.keyboard.down('c'); await color('red'); await page.keyboard.up('c'); await color('green');
  await page.mouse.move(100, 20);
  await page.getByRole('combobox', { name: 'Playback speed', exact: true }).click();
  await page.getByRole('option', { name: '3×', exact: true }).click();
  await returnToLibrary();
  const saved = await page.evaluate(async () => {
    const lib = await import('/src/lib/library.ts');
    return { games: await lib.getGames(), settings: await lib.getSettings() };
  });
  assert.equal(saved.games.find(game => game.fileName === 'Profile Quest.gba').profile.speed, 3);
  assert.equal(saved.settings.speed, 1, 'A profile speed change must not change the global default');
  assert.equal(saved.settings.controls.a, 'KeyX');
  await page.getByRole('button', { name: 'Play Default Quest', exact: true }).click();
  await color('green');
  assert.equal(await page.locator('.filter-pixel').count(), 1);
  assert.equal(await page.locator('.player-speed').textContent(), '1×');
  await page.keyboard.down('x'); await color('red'); await page.keyboard.up('x'); await color('green');
  await returnToLibrary();

  // Profile editor, library, navigation and player all fit a small phone.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'View Profile Quest', exact: true }).click();
  await page.locator('.profile-keyboard summary').click();
  await page.screenshot({ path: path.join(output, 'profile-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.modal').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const closeBox = await page.getByRole('button', { name: 'Close dialog', exact: true }).boundingBox();
  assert(closeBox.y >= 0 && closeBox.y + closeBox.height < 720, 'Mobile modal close stays visible while scrolling');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden', 'Closing game details must restore mobile library scrolling');
  await page.screenshot({ path: path.join(output, 'mobile-library-320.png'), fullPage: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert(await page.evaluate(() => scrollY > 0), 'The mobile library remains scrollable below the navigation');
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const destination of ['Saves', 'Settings', 'Library']) {
    const nav = page.locator('.mobile-nav').getByRole('button', { name: destination, exact: true });
    const box = await nav.boundingBox(); assert(box.height >= 44);
    await nav.click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), destination + ' must not overflow');
  }
  await page.getByRole('button', { name: 'Play Default Quest', exact: true }).click();
  await color('green');
  await page.mouse.move(150, 180);
  await page.getByRole('button',{name:'Open game menu',exact:true}).click();
  const toolbar = await page.locator('.player-toolbar').boundingBox();
  assert(toolbar.x >= 0 && toolbar.x + toolbar.width <= 321);
  for (const control of await page.locator('.player-toolbar > .player-control').all()) {
    const box = await control.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 321, 'Every mobile playback tool must fit');
  }
  const up = await page.getByRole('button', { name: 'Up', exact: true }).boundingBox();
  assert(up.width >= 44 && up.height >= 44);
  await page.screenshot({ path: path.join(output, 'mobile-player-320.png') });
  await returnToLibrary();
  await page.getByRole('button', { name: 'View Profile Quest', exact: true }).click();
  await page.getByLabel('Use custom game profile', { exact: true }).uncheck();
  assert.equal(await page.getByRole('combobox', { name: 'Game speed', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Play game', exact: true }).click();
  await color('green');
  assert.equal(await page.locator('.player-speed').textContent(), '1×');
  await returnToLibrary();
  assert.deepEqual(errors, []);
  const report = { profilePersistence: 'passed', gameIsolation: 'passed', liveSpeedStaysPerGame: 'passed', filterAndKeyboardApplied: 'passed', remappingEscape: 'passed', restoreGlobalDefaults: 'passed', mobile320px: 'passed', stickyModalClose: 'passed', mobilePlaybackTools: 'passed', largerTouchTargets: 'passed', browserErrors: errors };
  await writeFile(path.join(output, 'profiles-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'profiles-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }

