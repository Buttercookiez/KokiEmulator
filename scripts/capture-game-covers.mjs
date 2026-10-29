// Capture unmodified 240x160 frames from local, author-released homebrew ROMs.
// Start Vite first, then run: node scripts/capture-game-covers.mjs
// KOKI_TEST_URL may select a different local development server.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(await readFile(path.join(root, 'games/homebrew/sources.json'), 'utf8'));
const base = process.env.KOKI_TEST_URL || 'http://127.0.0.1:5173';
const output = path.join(root, 'public/covers');
const recipes = [
  { title: "Aunt Flora's Mansion", file: 'aunt-floras-mansion', speed: 4, boot: 1200, buttons: ['start'], delay: 700, hold: 100 },
  { title: 'Minicraft', file: 'minicraft', speed: 1, boot: 3000, buttons: ['a', 'a', 'a'], delay: 1800, hold: 200 },
  { title: 'Skyland', file: 'skyland', speed: 1, boot: 3000, buttons: ['a', 'a', 'a', 'a'], delay: 1800, hold: 200 },
  { title: 'Tigermoth', file: 'tigermoth', speed: 1, boot: 3000, buttons: [], delay: 0, hold: 0 },
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.KOKI_BROWSER_CHANNEL || 'msedge' });
try {
  for (const recipe of recipes) {
    const game = sources.find(source => source.title === recipe.title);
    if (!game) throw new Error(`Missing source manifest entry for ${recipe.title}`);
    const rom = await readFile(path.join(root, 'games/homebrew', game.file));
    if (createHash('sha256').update(rom).digest('hex') !== game.sha256) throw new Error(`Unexpected ROM for ${recipe.title}; keep artwork provenance accurate.`);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__cover-rom', route => route.fulfill({ contentType: 'application/octet-stream', body: rom }));
    await page.route('**/__cover-capture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Game artwork capture</title><canvas id="game"></canvas>' }));
    await page.goto(`${base}/__cover-capture`);
    await page.evaluate(async (speed) => {
      const { GbaEmulator } = await import('/src/lib/emulator.ts');
      window.coverEngine = new GbaEmulator(document.getElementById('game'));
      await window.coverEngine.load(new Uint8Array(await (await fetch('/__cover-rom')).arrayBuffer()));
      window.coverEngine.setVolume(0);
      window.coverEngine.setRewindSeconds(0);
      window.coverEngine.setSpeed(speed);
      window.coverEngine.play();
    }, recipe.speed);
    await page.waitForTimeout(recipe.boot);
    for (const button of recipe.buttons) {
      await page.evaluate(button => window.coverEngine.setButton(button, true), button);
      await page.waitForTimeout(recipe.hold);
      await page.evaluate(button => window.coverEngine.setButton(button, false), button);
      await page.waitForTimeout(recipe.delay);
    }
    const png = await page.evaluate(async () => Array.from(new Uint8Array(await (await window.coverEngine.screenshot()).arrayBuffer())));
    if (errors.length) throw new Error(`${recipe.title}: ${errors.join('; ')}`);
    await writeFile(path.join(output, `${recipe.file}.png`), Buffer.from(png));
    await page.evaluate(() => window.coverEngine.destroy());
    await page.close();
    console.log(`Captured ${recipe.title}`);
  }
} finally {
  await browser.close();
}
