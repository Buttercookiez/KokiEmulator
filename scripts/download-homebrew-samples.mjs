import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'games', 'homebrew');
const games = [
  { title: "Aunt Flora's Mansion", genre: 'Puzzle', developer: 'velipso; original game by anna anthropy', source: 'https://github.com/velipso/auntflora', license: '0BSD; port made with the original author’s permission', url: 'https://github.com/velipso/auntflora/releases/download/v1.1/AuntFlorasMansion.gba' },
  { title: 'Minicraft', genre: 'Survival / crafting', developer: 'Vulcalien; original Minicraft by Markus Persson', source: 'https://github.com/Vulcalien/minicraft-gba', license: 'GPL-3.0-or-later', url: 'https://github.com/Vulcalien/minicraft-gba/releases/download/2.0/minicraft-gba_2.0_SRAM-32KB.zip' },
  { title: 'Skyland', genre: 'Strategy', developer: 'Evan Bowman', source: 'https://github.com/evanbowman/skyland-beta/releases/tag/2026.9.30.0', license: 'MPL-2.0; developer-provided release', url: 'https://github.com/evanbowman/skyland-beta/releases/download/2026.9.30.0/Skyland.gba' },
  { title: 'Tigermoth', genre: 'Arcade shooter', developer: 'pmprog', source: 'https://pmprog.itch.io/tigermoth', license: 'MIT; official GBA Jam 2021 release', url: 'https://gbajam21.github.io/entries/tigermoth/tigermoth-20210617-beta2.gba' },
  { title: 'uCity Advance', genre: 'City building', developer: 'Antonio Niño Díaz / SkyLyrac', source: 'https://github.com/AntonioND/ucity-advance', license: 'GPL-3.0 code; CC-BY-NC-SA-4.0 art and original audio; other music under Mod Archive Distribution License', url: 'https://github.com/AntonioND/ucity-advance/releases/download/v1.0.3/ucity-advance-v1.0.3.gba' },
];

await mkdir(destination, { recursive: true });
const manifest = await Promise.all(games.map(async game => {
  const response = await fetch(game.url, { headers: { 'User-Agent': 'Koki-Homebrew-Setup' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${game.title}: download returned HTTP ${response.status}`);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (/\.zip$/i.test(game.url)) {
    const archive = unzipSync(bytes, { filter: entry => /\.gba$/i.test(entry.name) && entry.originalSize <= 32 * 1024 * 1024 });
    const candidates = Object.entries(archive);
    if (candidates.length !== 1) throw new Error(`${game.title}: expected one GBA ROM in the official ZIP, found ${candidates.length}`);
    bytes = candidates[0][1];
  }
  if (bytes.length < 192 || bytes.length > 32 * 1024 * 1024 || bytes[0xb2] !== 0x96) throw new Error(`${game.title}: downloaded file is not a supported GBA ROM`);
  let checksum = -0x19;
  for (let i = 0xa0; i <= 0xbc; i++) checksum -= bytes[i];
  if ((checksum & 255) !== bytes[0xbd]) throw new Error(`${game.title}: GBA header checksum failed`);
  const file = `${game.title}.gba`;
  await writeFile(path.join(destination, file), bytes);
  const result = { ...game, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  console.log(JSON.stringify({ title: game.title, file, bytes: bytes.length, sha256: result.sha256 }));
  return result;
}));
await writeFile(path.join(destination, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(destination, 'SOURCES.md'), '# Free homebrew games for Koki\n\nDownloaded from developer releases and the official GBA Jam archive for personal play. Original credits and source links are retained below. These games are separate from the emulator application and keep their authors’ licenses.\n\n' + manifest.map(game => `## ${game.title}\n\n- Developer: ${game.developer}\n- Genre: ${game.genre}\n- Official source: ${game.source}\n- Download: ${game.url}\n- License: ${game.license}\n- SHA-256: ${game.sha256}\n`).join('\n'));
console.log(`Ready: ${manifest.length} GBA games in ${destination}`);
