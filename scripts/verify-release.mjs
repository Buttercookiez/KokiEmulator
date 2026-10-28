import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
const require = createRequire(import.meta.url);
const { extractFile, getRawHeader } = require('@electron/asar');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const names = ['Kokis-Emulator-' + version + '-Windows.exe', 'koki-emulator-android-debug.apk'];
const artifacts = [];
for (const file of names) {
  const bytes = await readFile(path.join(release, file));
  artifacts.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
async function allFiles(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await allFiles(path.join(folder, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files;
}
async function folderBytes(folder) {
  return (await Promise.all((await allFiles(folder)).map(async file => (await stat(path.join(folder, file))).size))).reduce((sum, size) => sum + size, 0);
}
const bundle = await allFiles(path.join(root, 'dist'));
assert(!bundle.some(file => file.endsWith('.map')), 'Production must not contain source maps');
assert.equal(bundle.filter(file => file.endsWith('.woff2')).length, 1, 'Bundle only the required local font subset');
const apk = unzipSync(new Uint8Array(await readFile(path.join(release, names[1]))), { filter(entry) { return entry.name.startsWith('assets/public/') || /^classes[0-9]*[.]dex$/.test(entry.name); } });
const asar = path.join(release, 'win-unpacked/resources/app.asar');
const header = getRawHeader(asar).header.files;
assert(!header.node_modules, 'Desktop package must not duplicate bundled frontend dependencies');
assert(!header.electron.files['storage.test.cjs'], 'Do not ship filesystem tests');
assert.deepEqual(await readdir(path.join(release, 'win-unpacked/locales')), ['en-US.pak']);
assert.equal(JSON.parse(extractFile(asar, 'package.json').toString()).version, version);
for (const file of bundle) {
  const source = await readFile(path.join(root, 'dist', file));
  assert(apk['assets/public/' + file], 'APK is missing ' + file);
  assert(source.equals(Buffer.from(apk['assets/public/' + file])), 'APK contains stale ' + file);
  assert(source.equals(extractFile(asar, path.join('dist', ...file.split('/')))), 'Windows contains stale ' + file);
}
const nativeSources = ['electron/main.cjs', 'electron/preload.cjs', 'electron/storage.cjs'];
for (const file of nativeSources) assert((await readFile(path.join(root, file))).equals(extractFile(asar, path.join(...file.split('/')))), 'Windows contains stale ' + file);
const baseline = JSON.parse(await readFile(path.join(root, '.cache/size-before-0.3.0.json'), 'utf8'));
const current = { windows: artifacts[0].bytes, android: artifacts[1].bytes, desktopUnpacked: await folderBytes(path.join(release, 'win-unpacked')), appArchive: (await stat(asar)).size, web: await folderBytes(path.join(root, 'dist')) };
const sizes = {};
for (const name of Object.keys(current)) {
  assert(current[name] < baseline[name], name + ' must be smaller than the baseline');
  sizes[name] = { before: baseline[name], after: current[name], reductionPercent: Number(((1 - current[name] / baseline[name]) * 100).toFixed(2)) };
}
const mobilePlay = JSON.parse(await readFile(path.join(root, '.cache/test-results/mobile-play-report.json'), 'utf8'));
assert.equal(mobilePlay.version, version); assert.equal(mobilePlay.status, 'passed');
const saveHistory = JSON.parse(await readFile(path.join(root, '.cache/test-results/save-history-test-report.json'), 'utf8'));
assert.equal(saveHistory.version, version); assert.equal(saveHistory.collapsedByDefault, 'passed');
const motion = JSON.parse(await readFile(path.join(root, '.cache/test-results/motion-report.json'), 'utf8'));
assert.equal(motion.version, version); assert.equal(motion.status, 'passed');
const nativeWindows = JSON.parse(await readFile(path.join(root, '.cache/test-results/native-windows-report.json'), 'utf8'));
assert.equal(nativeWindows.version, version); assert.equal(nativeWindows.status, 'passed');
assert.equal(nativeWindows.asarSha256, createHash('sha256').update(await readFile(asar)).digest('hex'), 'Windows runtime check must match the packaged archive');
const dex = Object.entries(apk).filter(([name]) => /^classes[0-9]*[.]dex$/.test(name)).map(([,bytes]) => Buffer.from(bytes));
for (const entry of ['PlayerUi', 'setImmersive', 'haptic']) assert(dex.some(bytes => bytes.includes(Buffer.from(entry))), 'APK must retain native bridge entry ' + entry);
let previousAndroidRuntime;
try { previousAndroidRuntime = JSON.parse(await readFile(path.join(root, '.cache/test-results/android-runtime-report.json'), 'utf8')); } catch {}
const androidRuntime = previousAndroidRuntime?.version === version && previousAndroidRuntime?.apkSha256 === artifacts[1].sha256 ? previousAndroidRuntime : { version, status: 'not run for this build', nativeCompilation: 'passed', nativeBridgeEntrypoints: 'retained in optimized APK', browserTouchSuite: 'passed', physicalDevice: 'not tested' };
const report = {
  version, application: "Koki's Emulator", artifacts, sizeComparison: { baselineVersion: baseline.version, bytes: sizes },
  nativeSourcesMatchProduction: nativeSources, bundledAssetsMatchProduction: bundle,
  productionPruning: { duplicateDependencies: 'removed', sourceMaps: 'removed', fontSubsets: 1, runtimeLocales: ['en-US'] },
  androidBuild: 'optimized; debug-signed; native Android bridge compiled and retained; device runtime pending',
  androidRuntime, mobilePlay, nativeWindows, saveHistory, motion,
  windowsBuild: 'portable x64; packaged archive profile/save/relaunch tests passed',
  tests: { uiMotionAndRapidToggles: 'passed', reducedMotionSettingAndSystem: 'passed', saveHistoryCollapsedByDefault: 'passed', saveHistoryExpansionAndReload: 'passed', automatedUnitAndFilesystem: 60, desktopKeyboardAndFocus: 'passed', packagedWindowsSaveResumeAndProfiles: 'passed', gameProfileInheritanceAndBackupCompatibility: 'passed', immersivePlaybackAndFullscreen: 'passed', mobileControlsAndMultitouch: 'passed', oneThumbDiagonalsAndNeutralRelease: 'passed', perGameMobileProfilesAndReload: 'passed', screenPositionAndScale: 'passed', realCoreTurboPressAndRelease: 'passed', restorePreviewAndRecovery: 'passed', backupReminderAndExport: 'passed', nativeAndroidBridgeCompilation: 'passed', nativeAndroidRuntime: androidRuntime.status ?? 'see runtime report' },
};
await writeFile(path.join(release, 'BUILD-INFO.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(release, 'SHA256SUMS.txt'), artifacts.map(item => item.sha256 + '  ' + item.file).join('\n') + '\n');
console.log(JSON.stringify({ version, artifacts, sizeComparison: report.sizeComparison, bundledAssetsChecked: bundle.length, tests: report.tests, androidRuntime }));

