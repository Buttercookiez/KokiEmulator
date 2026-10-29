import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Original SVG brand exports plus actual, unretouched app captures. No network.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/play-store');
const artwork = path.join(root, 'assets/play-store');
const output = path.join(root, 'release/play-store/listing');
const screenshotSource = path.join(root, 'release/play-store/screenshots');
const requireScreenshots = process.argv.includes('--require-screenshots');
const listing = JSON.parse(await readFile(path.join(docs, 'listing.json'), 'utf8'));
const screenshots = JSON.parse(await readFile(path.join(docs, 'screenshots.json'), 'utf8'));
const limits = { appName: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 };
for (const [field, limit] of Object.entries(limits)) {
  assert.equal(typeof listing[field], 'string', field + ' is required');
  assert(listing[field].length > 0 && [...listing[field]].length <= limit, field + ' exceeds its limit');
}
assert.equal(listing.containsAds, false);
assert.equal(listing.inAppPurchases, false);
assert.equal(listing.accountRequired, false);
assert.match(listing.supportEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'graphics'), { recursive: true });
await mkdir(path.join(output, 'screenshots'), { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : n >>> 1;
  return n >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([head, name, data, checksum]);
}
function encodePng(width, height, pixels, alpha) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * channels);
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4, dest = row + 1 + x * channels;
      raw[dest] = pixels[source]; raw[dest + 1] = pixels[source + 1]; raw[dest + 2] = pixels[source + 2];
      if (alpha) raw[dest + 3] = pixels[source + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('sRGB', Buffer.from([0])), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function pngInfo(bytes) {
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', 'Expected PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const records = [];
try {
  const page = await browser.newPage();
  async function pixelsFromPng(buffer, expectedWidth, expectedHeight) {
    return page.evaluate(async ({ data, expectedWidth, expectedHeight }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      if (image.width !== expectedWidth || image.height !== expectedHeight) throw new Error('Raster size mismatch');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(0, 0, image.width, image.height).data);
    }, { data: buffer.toString('base64'), expectedWidth, expectedHeight });
  }
  async function record(relative, bytes, extra = {}) {
    records.push({ file: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...pngInfo(bytes), ...extra });
  }
  const inter = (await readFile(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))).toString('base64');
  for (const asset of [{ name:'app-icon', width:512, height:512, alpha:true }, { name:'feature-graphic', width:1024, height:500, alpha:false }]) {
    const svg = await readFile(path.join(artwork, asset.name + '.svg'), 'utf8');
    await page.setViewportSize({ width: asset.width, height: asset.height });
    await page.setContent('<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,' + inter + ') format("woff2");font-weight:100 900}html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>' + svg);
    await page.evaluate(() => document.fonts.ready);
    const source = await page.screenshot({ omitBackground: asset.alpha });
    const pixels = await pixelsFromPng(source, asset.width, asset.height);
    assert(pixels.every((value,index) => index % 4 !== 3 || value === 255), 'Brand graphics must be opaque full-bleed artwork');
    const bytes = encodePng(asset.width, asset.height, pixels, asset.alpha);
    const info = pngInfo(bytes);
    assert.equal(info.colorType, asset.alpha ? 6 : 2); assert.equal(info.bitDepth, 8);
    assert(bytes.length < 1024 * 1024, 'Store artwork should stay below 1 MB');
    await writeFile(path.join(artwork, asset.name + '.png'), bytes);
    const relative = 'graphics/' + asset.name + '.png';
    await writeFile(path.join(output, relative), bytes);
    await record(relative, bytes, { kind: asset.name, provenance: 'Original Koki vector branding, rendered locally' });
  }
  const missing = [];
  for (const screenshot of screenshots) {
    assert.match(screenshot.file, /^\d\d-[a-z-]+\.png$/);
    const source = path.join(screenshotSource, screenshot.file);
    let bytes;
    try { bytes = await readFile(source); } catch (error) { if (error.code === 'ENOENT') { missing.push(screenshot.file); continue; } throw error; }
    const info = pngInfo(bytes);
    assert.equal(info.bitDepth, 8);
    assert(Math.min(info.width, info.height) >= 320 && Math.max(info.width, info.height) <= 3840, 'Screenshot dimensions out of range: ' + screenshot.file);
    assert(Math.max(info.width, info.height) <= Math.min(info.width, info.height) * 2, 'Screenshot aspect ratio exceeds 2:1: ' + screenshot.file);
    if (info.colorType !== 2) {
      const pixels = await pixelsFromPng(bytes, info.width, info.height);
      assert(pixels.every((value,index) => index % 4 !== 3 || value === 255), 'Actual screenshots must have an opaque background');
      bytes = encodePng(info.width, info.height, pixels, false);
    }
    const relative = 'screenshots/' + screenshot.file;
    await writeFile(path.join(output, relative), bytes);
    await record(relative, bytes, { kind:'actual-app-screenshot', alt: screenshot.alt, purpose: screenshot.purpose, source: 'release/play-store/screenshots/' + screenshot.file });
  }
  for (const [field, filename] of [['appName','app-name.txt'],['shortDescription','short-description.txt'],['fullDescription','full-description.txt'],['releaseNotes','release-notes.txt']]) await writeFile(path.join(output,filename), listing[field] + '\n');
  for (const name of await readdir(docs)) if (name.endsWith('.md') || name.endsWith('.json')) await copyFile(path.join(docs,name),path.join(output,name));
  const report = { preparedForVersion:listing.preparedForVersion, packageName:listing.packageName, generatedAt:new Date().toISOString(), textCharacterCounts:Object.fromEntries(Object.keys(limits).map(field => [field,[...listing[field]].length])), graphics:records, actualScreenshotCount:records.filter(record => record.kind === 'actual-app-screenshot').length, missingScreenshots:missing, ownerDecisionsPending:['Play Console account verification/terms and package availability','Confirm the owner-selected 13+ age groups in Play Console and submit the actual IARC questionnaire','Closed-test enrollment, feedback and production-access decision'], noSigningSecretsIncluded:true };
  await writeFile(path.join(output,'ASSET-VALIDATION.json'), JSON.stringify(report,null,2) + '\n');
  console.log(JSON.stringify({ output, version:listing.preparedForVersion, appName:listing.appName, characters:report.textCharacterCounts, graphics:records.map(({file,bytes,width,height,colorType}) => ({file,bytes,width,height,colorType})), missingScreenshots:missing },null,2));
  if (requireScreenshots && missing.length) throw new Error('Actual current-version screenshots still required: ' + missing.join(', '));
} finally { await browser.close(); }
