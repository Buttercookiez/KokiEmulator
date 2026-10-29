const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const appIcons = path.join(root, 'assets', 'app-icons');
  const res = path.join(root, 'android-nds', 'app', 'src', 'main', 'res');
  const icon = await fs.readFile(path.join(appIcons, 'koki-nds.svg'), 'utf8');
  const round = icon.replace('<rect width="64" height="64" rx="16" fill="#161616"/>', '<circle cx="32" cy="32" r="32" fill="#161616"/>');
  const windowsOnly = process.argv.includes('--windows-only');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    async function render(svg, size) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>' + svg);
      return page.screenshot({ omitBackground: true });
    }
    if (!windowsOnly) {
      for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
        const destination = path.join(res, 'mipmap-' + density);
        await fs.mkdir(destination, { recursive: true });
        await fs.writeFile(path.join(destination, 'ic_launcher.png'), await render(icon, size));
        await fs.writeFile(path.join(destination, 'ic_launcher_round.png'), await render(round, size));
      }
      // The same outlined artwork supplies adaptive and themed Android icons.
      const paths = await page.evaluate(svg => {
        const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
        return [...document.querySelectorAll('path')].map(element => element.getAttribute('d'));
      }, icon);
      const foreground = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n' +
        '    <group android:translateX="18.16" android:translateY="18.16" android:scaleX="1.12" android:scaleY="1.12">\n' +
        paths.map(d => '        <path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="' + d + '"/>').join('\n') +
        '\n    </group>\n</vector>\n';
      await fs.writeFile(path.join(res, 'drawable', 'koki_launcher_foreground.xml'), foreground);
      const preview = path.join(root, '.cache', 'android-icon');
      await fs.mkdir(preview, { recursive: true });
      await fs.writeFile(path.join(preview, 'koki-nds-icon.png'), await render(icon, 512));
      await fs.writeFile(path.join(preview, 'koki-nds-icon-round.png'), await render(round, 192));
      console.log('Generated NDS Android launcher icons, adaptive/themed foreground, and previews.');
    }
    if (!windowsOnly && !process.argv.includes('--include-windows')) return;
    await fs.writeFile(path.join(appIcons, 'koki-nds.png'), await render(icon, 512));
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
    await fs.writeFile(path.join(appIcons, 'koki-nds.ico'), Buffer.concat([directory, ...images.map((image) => image.bytes)]));
    console.log('Generated the Windows PNG and multi-resolution ICO using the NDS badge artwork.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
