import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.KOKI_TEST_URL || 'http://127.0.0.1:5173';
const output = path.join(root, '.cache/test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1326, height: 940 }, colorScheme: 'dark' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Add your first game', exact: true }).waitFor();
  const game = "Aunt Flora's Mansion";
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles([
    path.join(root, 'games/homebrew', game + '.gba'),
    path.join(root, 'games/homebrew/Minicraft.gba'),
  ]);
  const card = page.locator('.game-card').filter({ has: page.getByRole('button', { name: 'View ' + game, exact: true }) });
  await card.locator('.cover-art').waitFor();
  const details = page.getByRole('dialog', { name: 'Game details', exact: true });
  const open = async () => { await card.getByRole('button', { name: 'View ' + game, exact: true }).click(); await details.waitFor(); };
  const close = async () => { await details.getByRole('button', { name: 'Close dialog', exact: true }).click(); await details.waitFor({ state: 'detached' }); };
  const remove = async () => { await details.getByRole('button', { name: 'Remove cover', exact: true }).click(); await details.getByRole('button', { name: 'Restore default cover', exact: true }).waitFor(); assert.equal(await details.locator('.cover-art').count(), 0); };

  await open();
  await remove();
  await page.screenshot({ path: path.join(output, 'remove-cover-dark.png'), fullPage: true });
  await close();
  await page.reload();
  await card.locator('.game-cover.fallback').waitFor();
  assert.equal(await page.locator('.game-card').count(), 2, 'Removing art must keep the imported games');
  assert.equal(await page.locator('.game-card .cover-art').count(), 1, 'Other game artwork must be unchanged');
  await open();
  await details.getByRole('button', { name: 'Restore default cover', exact: true }).click();
  await details.locator('.cover-art').waitFor();
  assert((await details.locator('.cover-art').getAttribute('src')).startsWith('./covers/'), 'Restore should bring back the bundled cover');
  await page.getByLabel('Choose local cover artwork', { exact: true }).setInputFiles(path.join(root, 'public/covers/minicraft.png'));
  await page.waitForFunction(() => document.querySelector('.modal .cover-art')?.getAttribute('src')?.startsWith('data:image/'));
  await remove();
  await page.getByLabel('Choose local cover artwork', { exact: true }).setInputFiles(path.join(root, 'public/covers/aunt-floras-mansion.png'));
  await details.getByRole('button', { name: 'Remove cover', exact: true }).waitFor();
  assert((await details.locator('.cover-art').getAttribute('src')).startsWith('data:image/'), 'Choosing a new custom image must unhide artwork');

  await remove();
  await details.getByRole('button', { name: 'Play game', exact: true }).click();
  await page.waitForFunction(() => { const button = document.querySelector('.player-toolbar button'); return button && !button.disabled; }, {}, { timeout: 30_000 });
  await page.mouse.move((await page.evaluate(() => innerWidth)) / 2, 8);
  await page.locator('.player-shell[data-controls-visible="true"]').waitFor();
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await page.locator('.player-shell').waitFor({ state: 'detached' });
  await card.locator('.game-cover.fallback').waitFor();
  await page.getByRole('button', { name: 'Resume game', exact: true }).waitFor();
  assert.equal(await card.locator('.cover-art').count(), 0, 'A new gameplay screenshot must not undo cover removal');
  await open();
  await page.setViewportSize({ width: 390, height: 844 });
  const restore = details.getByRole('button', { name: 'Restore default cover', exact: true });
  await restore.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Cover actions must fit on mobile');
  while (await page.locator('.toast-close').count()) await page.locator('.toast-close').first().click();
  await page.screenshot({ path: path.join(output, 'remove-cover-mobile.png'), fullPage: true });
  await restore.click();
  await details.locator('.cover-art').waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ removeBundledCover: 'passed', persistedAfterReload: 'passed', restoreDefault: 'passed', removeCustomCover: 'passed', chooseAfterRemoval: 'passed', hiddenAfterNewScreenshot: 'passed', gamesAndProgressPreserved: 'passed', mobileActions: 'passed', browserErrors: errors }));
} finally { await browser.close(); }

