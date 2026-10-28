import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDiagnosticRom } from './make-diagnostic-rom.mjs';

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.cache/test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1326, height: 940 }, colorScheme: 'dark' });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.KOKI_TEST_URL || 'http://127.0.0.1:5182');
  await page.getByRole('heading', { name: 'Your library', exact: true }).waitFor();
  const add = page.locator('.import-group > button');
  assert.equal(await add.locator('.lucide-chevron-down').count(), 0, 'Add games should have no dropdown arrow');
  await add.click();
  await page.getByRole('menuitem', { name: 'Choose game files', exact: true }).waitFor();
  await page.getByRole('menuitem', { name: 'Add a game folder', exact: true }).waitFor();
  await page.getByRole('menuitem', { name: 'Restore a backup', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'detached' });
  await page.locator('.sidebar').getByRole('button', { name: 'Save history', exact: true }).click();
  await page.getByRole('heading', { name: 'No checkpoints yet', exact: true }).waitFor();
  await page.locator('.sidebar').getByRole('button', { name: 'Library', exact: true }).click();
  const second = makeDiagnosticRom(); second[0x700] = 1;
  await page.getByLabel('Import GBA games', { exact: true }).setInputFiles([
    { name: 'Forest Quest.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDiagnosticRom()) },
    { name: 'Sky Circuit.gba', mimeType: 'application/octet-stream', buffer: Buffer.from(second) },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.game-card').length === 2);
  const ids = await page.evaluate(async () => {
    const library = await import('/src/lib/library.ts');
    const { GbaEmulator } = await import('/src/lib/emulator.ts');
    const games = await library.getGames();
    const forest = games.find(game => game.fileName === 'Forest Quest.gba');
    const circuit = games.find(game => game.fileName === 'Sky Circuit.gba');
    await library.updateGame(forest.id, { title: 'Forest Quest' });
    await library.updateGame(circuit.id, { title: 'Sky Circuit' });
    const states = new Map();
    for (const game of games) {
      const core = new GbaEmulator(document.createElement('canvas'));
      try { await core.load(await library.getRom(game.id)); states.set(game.id, core.saveState()); }
      finally { core.destroy(); }
    }
    for (const [id, label] of [[forest.id, 'Camp'], [circuit.id, 'Circuit pit'], [forest.id, 'Gate']]) {
      await library.createSnapshot(id, states.get(id), { label, kind: 'manual' });
      await new Promise(resolve => setTimeout(resolve, 4));
    }
    return { forest: forest.id, circuit: circuit.id };
  });
  await page.locator('.sidebar').getByRole('button', { name: 'Save history', exact: true }).click();
  const forest = page.locator('.save-game-group[data-game-id="' + ids.forest + '"]');
  const circuit = page.locator('.save-game-group[data-game-id="' + ids.circuit + '"]');
  await page.getByRole('heading', { name: 'Forest Quest', exact: true }).waitFor();
  assert.equal(await page.locator('.save-game-group').count(), 2);
  assert.deepEqual(await page.locator('.save-game-title').allTextContents(), ['Forest Quest', 'Sky Circuit'], 'Game groups follow the latest checkpoint');
  assert.equal(await forest.locator('.save-game-count').textContent(), '2 checkpoints');
  assert.equal(await circuit.locator('.save-game-count').textContent(), '1 checkpoint');
  assert.deepEqual(await forest.locator('.snapshot-info strong').allTextContents(), ['Gate', 'Camp']);
  assert.deepEqual(await circuit.locator('.snapshot-info strong').allTextContents(), ['Circuit pit']);
  assert(!(await forest.locator('.snapshot-info').allTextContents()).some(text => text.includes('Forest Quest')), 'Rows should not repeat their game heading');
  assert.equal(await forest.getAttribute('open'), null, 'Game save groups start collapsed');
  assert.equal(await circuit.getAttribute('open'), null, 'Every game starts collapsed');
  await forest.locator('summary').click();
  assert.notEqual(await forest.getAttribute('open'), null);
  await forest.locator('summary').click();
  await page.waitForFunction(id => !document.querySelector('[data-game-id="' + id + '"]')?.hasAttribute('open'), ids.forest);
  assert.equal(await forest.getAttribute('open'), null);
  assert.equal(await forest.locator('.snapshot-row').first().isVisible(), false);
  await forest.locator('summary').press('Enter');
  await forest.locator('.snapshot-row').first().waitFor();
  await page.screenshot({ path: path.join(output, 'save-history-dark.png'), fullPage: true });
  await page.locator('.app-chrome .theme-switch').getByRole('button', { name: 'Light', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'save-history-light.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Grouped saves must fit a narrow phone');
  await page.screenshot({ path: path.join(output, 'save-history-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1326, height: 940 });
  await circuit.locator('summary').click();
  await circuit.getByRole('button', { name: 'Play from Circuit pit', exact: true }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.player-screen-wrap canvas');
    return canvas?.getContext('2d').getImageData(120, 80, 1, 1).data[1] > 200;
  });
  await page.locator('.player-screen-wrap canvas').focus();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Save and return to library', exact: true }).click();
  await page.locator('.player-shell').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.save-game-title').first().textContent(), 'Sky Circuit', 'Playing from a checkpoint updates that game group');
  await forest.getByRole('button', { name: 'Delete Camp', exact: true }).click();
  await page.waitForFunction(id => document.querySelector('[data-game-id="' + id + '"] .save-game-count')?.textContent === '1 checkpoint', ids.forest);
  assert.equal(await circuit.locator('.snapshot-row').count(), 2, 'Deleting a checkpoint leaves the other game untouched');
  await forest.getByRole('button', { name: 'Delete Gate', exact: true }).click();
  await forest.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.save-game-group').count(), 1, 'An empty group disappears');
  assert.equal(await page.evaluate(async () => (await (await import('/src/lib/library.ts')).getGames()).length), 2, 'Removing checkpoints must keep both games');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Save history', exact: true }).click();
  await page.getByRole('heading', { name: 'Sky Circuit', exact: true }).waitFor();
  assert.equal(await page.locator('.save-game-group').count(), 1);
  assert.equal(await page.locator('.save-game-group[open]').count(), 0, 'Reload starts with every group collapsed again');
  assert.deepEqual(errors, []);
  const report = { version, collapsedByDefault: 'passed', groupedByGame: 'passed', checkpointCounts: 'passed', newestFirst: 'passed', collapseAndKeyboard: 'passed', restoreCorrectGame: 'passed', isolatedDeletion: 'passed', emptyGroupRemoval: 'passed', reloadPersistence: 'passed', minimalAddGames: 'passed', importMenuPreserved: 'passed', lightDarkAnd320px: 'passed', browserErrors: errors };
  await writeFile(path.join(output, 'save-history-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'save-history-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
