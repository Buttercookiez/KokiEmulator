import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'release/play-store');
const metadata = JSON.parse(await readFile(path.join(output, 'BUILD-INFO.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk');
const jdk = process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr';
const java = path.join(jdk, 'bin/java.exe');
const bundletool = process.env.KOKI_BUNDLETOOL || path.join(root, '.cache/play-tools/bundletool-all-1.18.3.jar');
assert(existsSync(bundletool), 'Set KOKI_BUNDLETOOL to the official bundletool-all JAR.');
const buildTools = (await readdir(path.join(sdk, 'build-tools'))).filter(n => /^\d+\.\d+\.\d+$/.test(n)).sort((a,b) => b.localeCompare(a, undefined, { numeric:true }));
const toolDir = buildTools.map(n => path.join(sdk, 'build-tools', n)).find(p => existsSync(path.join(p, 'aapt2.exe')));
function run(executable, args) {
  const r = spawnSync(executable, args, { cwd:root, windowsHide:true, encoding:'utf8', timeout:90000, maxBuffer:8*1024*1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, path.basename(executable) + ': ' + (r.stderr || r.stdout).slice(-2000));
  return r.stdout;
}
const bundle = metadata.artifacts.find(x => x.file.endsWith('.aab'));
const apk = metadata.artifacts.find(x => x.file.endsWith('.apk'));
assert(bundle && apk, 'Both upload bundle and verification APK are required');
assert.equal(metadata.version, pkg.version);
const bundlePath = path.join(output, bundle.file), apkPath = path.join(output, apk.file);
for (const artifact of metadata.artifacts) {
  assert.equal(path.basename(artifact.file), artifact.file);
  const bytes = await readFile(path.join(output, artifact.file));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
}
const bundletoolVersion = run(java, ['-jar', bundletool, 'version']).trim();
run(java, ['-jar', bundletool, 'validate', '--bundle=' + bundlePath]);
const manifest = run(java, ['-jar', bundletool, 'dump', 'manifest', '--bundle=' + bundlePath, '--module=base']);
assert(manifest.includes('package="com.koki.emulator"'));
assert(manifest.includes('android:versionName="' + pkg.version + '"'));
assert(manifest.includes('android:versionCode="' + metadata.versionCode + '"'));
assert(manifest.includes('android:targetSdkVersion="36"'));
assert(manifest.includes('android:minSdkVersion="24"'));
assert(manifest.includes('android:allowBackup="false"'));
assert(!manifest.includes('android:debuggable="true"'));
const permissions = [...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map(m => m[1]);
assert(permissions.every(p => p === 'android.permission.INTERNET' || p === 'com.koki.emulator.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'), 'Unexpected permission: ' + permissions.join(', '));
const apkBadging = run(path.join(toolDir, 'aapt2.exe'), ['dump','badging',apkPath]);
assert(apkBadging.includes("versionName='" + pkg.version + "'"));
assert(!apkBadging.includes('application-debuggable'));
const apkSigner = run(java, ['-jar',path.join(toolDir,'lib/apksigner.jar'),'verify','--print-certs',apkPath]);
assert(!/CN=Android Debug/i.test(apkSigner));
assert(apkSigner.toLowerCase().includes(metadata.signing.certificateSha256));
const publicCert = new X509Certificate(await readFile(path.join(output,'upload-certificate.pem')));
assert.equal(publicCert.fingerprint256.replaceAll(':','').toLowerCase(), metadata.signing.certificateSha256);
const bundles = unzipSync(new Uint8Array(await readFile(bundlePath)));
const apks = unzipSync(new Uint8Array(await readFile(apkPath)));
const allNames = Object.keys(bundles);
assert(!allNames.some(n => /\.(gba|gbc|gb|sav|state|p12|jks|keystore|dpapi)$/i.test(n)), 'Do not bundle game/test/private signing files');
assert(!allNames.some(n => /(?:^|\/)(?:\.env|upload-secret)/i.test(n)));
assert(!allNames.some(n => n.endsWith('.so')), 'Review native-library 16 KB alignment if native .so libraries are introduced');
assert(!bundles['base/assets/public/covers/ucity-advance.png']);
assert(!allNames.some(n => n.startsWith('base/assets/public/') && n.endsWith('.map')), 'Do not ship source maps');
async function files(directory, prefix='') {
  let result=[];
  for (const item of await readdir(directory,{withFileTypes:true})) {
    const name=prefix+item.name;
    result.push(...(item.isDirectory()?await files(path.join(directory,item.name),name+'/'):[name]));
  }
  return result;
}
const frontend = await files(path.join(root,'dist'));
for (const file of frontend) {
  const bytes=await readFile(path.join(root,'dist',file));
  assert(Buffer.from(bundles['base/assets/public/'+file] || []).equals(bytes), 'AAB stale/missing asset: '+file);
  assert(Buffer.from(apks['assets/public/'+file] || []).equals(bytes), 'APK stale/missing asset: '+file);
}
const dex = Object.entries(apks).filter(([n])=>/^classes\d*\.dex$/.test(n)).map(([,v])=>Buffer.from(v));
for (const entry of ['PlayerUi','setImmersive','haptic']) assert(dex.some(b=>b.includes(Buffer.from(entry))), 'Missing optimized native bridge entry '+entry);
const allFrontendJs=Object.entries(apks).filter(([n])=>/^assets\/public\/assets\/.*\.js$/.test(n)).map(([,v])=>Buffer.from(v).toString()).join('\n');
for (const text of ['johnfrancismarabe040905@gmail.com','John Francis Marabe','Keeping and deleting data']) assert(allFrontendJs.includes(text), 'Missing offline privacy content: '+text);
const resources = run(path.join(toolDir,'aapt2.exe'), ['dump','resources',apkPath]).replaceAll('\r\n','\n');
const providerIndex = resources.indexOf(' xml/file_paths\n');
assert(providerIndex >= 0, 'Export provider resource is packaged');
const providerNext = resources.indexOf('\n    resource',providerIndex+1);
const providerBlock = resources.slice(providerIndex, providerNext > 0 ? providerNext : undefined);
const providerFile = providerBlock.match(/\(file\) (res\/\S+) type=XML/)?.[1];
assert(providerFile, 'Export provider XML path is packaged');
const provider = run(path.join(toolDir,'aapt2.exe'), ['dump','xmltree',apkPath,'--file',providerFile]);
assert(provider.includes('exports/'));
assert(!provider.includes('external-path'));
const report={status:'passed',version:pkg.version,versionCode:metadata.versionCode,applicationId:metadata.applicationId,verifiedAt:new Date().toISOString(),bundletoolVersion,bundletoolValidation:'passed',bundleAndApkHashes:'passed',productionSigner:'passed',debuggingDisabled:true,minSdk:24,targetSdk:36,permissions,androidAutoBackup:false,exportProvider:'cache/exports only',noBundledRomsOrSigningSecrets:true,nativeSharedLibraries:0,matchingProductionAssets:frontend.length,offlinePolicy:'passed',nativeBridgeRetained:'passed',physicalDevice:'not tested',artifacts:metadata.artifacts};
await mkdir(path.join(root,'.cache/play-tests'),{recursive:true});
await writeFile(path.join(root,'.cache/play-tests/bundle-manifest.xml'),manifest);
await writeFile(path.join(output,'VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
