const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const brand = path.join(root, 'assets', 'brand');
  const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
  const icon = await fs.readFile(path.join(brand, 'koki-app-icon.svg'), 'utf8');
  const round = icon.replace('<rect width="64" height="64" rx="16" fill="#161616"/>', '<circle cx="32" cy="32" r="32" fill="#161616"/>');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    async function render(svg, size) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>' + svg);
      return page.screenshot({ omitBackground: true });
    }
    for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
      const destination = path.join(res, 'mipmap-' + density);
      await fs.mkdir(destination, { recursive: true });
      await fs.writeFile(path.join(destination, 'ic_launcher.png'), await render(icon, size));
      await fs.writeFile(path.join(destination, 'ic_launcher_round.png'), await render(round, size));
    }
    const images = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256]) images.push({ size, bytes: await render(icon, size) });
    const directory = Buffer.alloc(6 + images.length * 16);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(images.length, 4);
    let offset = directory.length;
    images.forEach((image, index) => {
      const entry = 6 + index * 16;
      directory.writeUInt8(image.size === 256 ? 0 : image.size, entry);
      directory.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1);
      directory.writeUInt16LE(1, entry + 4);
      directory.writeUInt16LE(32, entry + 6);
      directory.writeUInt32LE(image.bytes.length, entry + 8);
      directory.writeUInt32LE(offset, entry + 12);
      offset += image.bytes.length;
    });
    await fs.writeFile(path.join(brand, 'koki-app-icon.ico'), Buffer.concat([directory, ...images.map((image) => image.bytes)]));
    console.log('Generated legacy Android launcher icons and a multi-resolution Windows ICO from the original SVG.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
