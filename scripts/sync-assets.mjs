import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/brand');
const destination = path.join(root, 'public/brand');
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) if (/\.(svg|png)$/i.test(name)) await copyFile(path.join(source, name), path.join(destination, name));

const notices = [];
const text = async (relativePath) => (await readFile(path.join(root, relativePath), 'utf8')).replace(/\r\n/g, '\n').trimEnd();
async function licenseFile(relativePath, sourceUrl) {
  const contents = await text(relativePath);
  if (!contents || contents.length < 80) throw new Error('Missing license contents: ' + relativePath);
  return { name: path.basename(relativePath), origin: relativePath.replaceAll('\\', '/'), source: sourceUrl || '', sha256: createHash('sha256').update(contents).digest('hex'), text: contents };
}
for (const packageName of ['react', 'react-dom', 'scheduler', 'lucide-react', 'idb', 'fflate', '@fontsource-variable/inter', '@capacitor/core', '@capacitor/android', '@capacitor/app', '@capacitor/filesystem', '@capacitor/share']) {
  const packageRoot = path.join('node_modules', packageName);
  const pkg = JSON.parse(await text(path.join(packageRoot, 'package.json')));
  const licenseName = (await readdir(path.join(root, packageRoot))).find((name) => /^LICENSE(?:\.txt|\.md)?$/i.test(name));
  if (!licenseName) throw new Error('No installed license file found for ' + packageName);
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  notices.push({
    id: packageName.replaceAll(/[^a-z0-9-]/gi, '-'), name: packageName, version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : 'See included license',
    category: packageName.startsWith('@capacitor/') ? 'Native bridge' : 'Interface',
    description: packageName === '@fontsource-variable/inter' ? 'Inter typography, bundled locally through Fontsource.' : '',
    source: repository.replace(/^git\+/, '').replace(/\.git$/, ''),
    files: [await licenseFile(path.join(packageRoot, licenseName))],
  });
}
const corePackage = JSON.parse(await text('node_modules/@wasm-gaming/mgba-wasm/package.json'));
notices.push({
  id: 'mgba', name: 'mGBA and @wasm-gaming/mgba-wasm', version: corePackage.version, license: 'MPL-2.0', category: 'Emulator core',
  description: 'Unmodified core artifacts from the pinned package. Jeffrey Pfau and mGBA contributors; wrapper/shim source and build information are included below.',
  source: 'https://github.com/wasm-gaming/mGBA-wasm',
  files: [await licenseFile('licenses/MPL-2.0.txt'), await licenseFile('docs/EMULATOR-CORE.md')],
});
const nativeSources = JSON.parse(await text('licenses/native/sources.json'));
const nativeFile = async (name) => {
  const provenance = nativeSources.find((entry) => entry.file === name);
  if (!provenance) throw new Error('Missing native license provenance: ' + name);
  const bytes = await readFile(path.join(root, 'licenses/native', name));
  if (createHash('sha256').update(bytes).digest('hex') !== provenance.sha256) throw new Error('Native license provenance mismatch: ' + name);
  return licenseFile('licenses/native/' + name, provenance.source);
};
const variables = await text('android/variables.gradle');
const nativeVersion = (name) => variables.match(new RegExp(name + "\\s*=\\s*'([^']+)'"))?.[1] || 'See Android configuration';
notices.push({
  id: 'androidx', name: 'AndroidX', version: 'Activity ' + nativeVersion('androidxActivityVersion') + ', AppCompat ' + nativeVersion('androidxAppCompatVersion') + ', Core ' + nativeVersion('androidxCoreVersion'),
  license: 'Apache-2.0', category: 'Android runtime', source: 'https://github.com/androidx/androidx',
  description: 'Android support libraries used by the app and Capacitor, including Fragment, CoordinatorLayout, WebKit and Core SplashScreen. Versions are configured in android/variables.gradle.',
  files: [await nativeFile('AndroidX-Apache-2.0.txt')],
});
const filesystemGradle = await text('node_modules/@capacitor/filesystem/android/build.gradle');
const kotlinVersion = filesystemGradle.match(/ext\.kotlin_version\s*=.*?:\s*'([^']+)'/)?.[1] || 'See native dependency configuration';
const coroutinesVersion = filesystemGradle.match(/kotlinxCoroutinesVersion\s*=.*?:\s*'([^']+)'/)?.[1] || 'See native dependency configuration';
notices.push({
  id: 'kotlin', name: 'Kotlin runtime and kotlinx.coroutines', version: kotlinVersion + ' / ' + coroutinesVersion, license: 'Apache-2.0', category: 'Android runtime',
  description: 'Kotlin runtime and coroutine components used by the native filesystem implementation.', source: 'https://github.com/JetBrains/kotlin',
  files: [await nativeFile('Kotlin-Apache-2.0.txt')],
});
notices.push({
  id: 'cordova', name: 'Apache Cordova Android', version: nativeVersion('cordovaAndroidVersion'), license: 'Apache-2.0', category: 'Android runtime',
  description: 'Native Cordova compatibility runtime used by Capacitor.', source: 'https://github.com/apache/cordova-android',
  files: [await nativeFile('Cordova-Apache-2.0.txt'), await nativeFile('Cordova-NOTICE.txt')],
});
notices.push({
  id: 'ion-filesystem', name: 'Ionic native filesystem library', version: filesystemGradle.match(/io\.ionic\.libs:ionfilesystem-android:([^"]+)/)?.[1] || 'See native dependency configuration',
  license: 'MIT', category: 'Android runtime', description: 'Native filesystem library used by the Capacitor Filesystem plugin.', source: 'https://github.com/ionic-team/ion-android-filesystem',
  files: [await nativeFile('Ionic-IonFilesystem-MIT.txt')],
});
const artworkCredits = await text('public/covers/CREDITS.md');
const artworkLicenses = [...new Set([...artworkCredits.matchAll(/\]\(\.\/licenses\/([^)]+\.txt)\)/g)].map((match) => match[1]))].sort();
if (!artworkLicenses.length) throw new Error('No current artwork licenses found in bundled credits.');
notices.push({
  id: 'artwork', name: 'Bundled homebrew artwork', version: 'Four screenshots', license: 'See individual artwork licenses', category: 'Artwork',
  description: 'Screenshots identify imported homebrew games. Their creators, sources and license texts are retained below. No game ROMs or Nintendo BIOS are bundled.', source: '',
  files: [await licenseFile('public/covers/CREDITS.md'), ...await Promise.all(artworkLicenses.map((name) => licenseFile('public/covers/licenses/' + name)))],
});
const inventory = {
  schemaVersion: 1, generatedBy: 'scripts/sync-assets.mjs',
  summary: 'License and copyright notices for the listed components, available entirely offline.',
  scope: 'Installed frontend and Capacitor packages, the distributed mGBA core, identified native runtime components and bundled artwork. Platform WebView and Electron distributions retain their accompanying notices.',
  notices,
};
const json = JSON.stringify(inventory, null, 2) + '\n';
await mkdir(path.join(root, 'src/legal'), { recursive: true });
for (const [relativePath, contents] of [
  ['src/legal/third-party.json', json],
]) {
  let existing = '';
  try { existing = await readFile(path.join(root, relativePath), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing !== contents) await writeFile(path.join(root, relativePath), contents);
}
console.log('Prepared original Koki brand assets and ' + notices.length + ' offline license groups.');
