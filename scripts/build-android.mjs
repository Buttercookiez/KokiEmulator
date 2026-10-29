import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, X509Certificate } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const environment = { ...process.env };
const flags = new Set(process.argv.slice(2));
const play = flags.has('--play');
if (play && (flags.has('--debug') || flags.has('--release'))) throw new Error('Use --play on its own, optionally with --skip-web.');
const signingNames = ['KOKI_UPLOAD_STORE_FILE', 'KOKI_UPLOAD_STORE_PASSWORD', 'KOKI_UPLOAD_KEY_ALIAS', 'KOKI_UPLOAD_KEY_PASSWORD'];
if (play) {
  const missing = signingNames.filter((name) => !environment[name]);
  if (missing.length) throw new Error('Play signing is required. Missing: ' + missing.join(', ') + '. On Windows run scripts/android-signing.ps1 -Action Build.');
  const storePath = path.resolve(environment.KOKI_UPLOAD_STORE_FILE);
  const relativeStore = path.relative(root, storePath);
  if (!relativeStore.startsWith('..' + path.sep) && relativeStore !== '..' && !path.isAbsolute(relativeStore)) throw new Error('Keep the production upload keystore outside the project and Git checkout.');
  if (!(await fs.stat(storePath)).isFile()) throw new Error('Production upload keystore is not a file.');
  environment.KOKI_UPLOAD_STORE_FILE = storePath;
  environment.KOKI_REQUIRE_PLAY_SIGNING = '1';
}
const projectId = createHash('sha256').update(root).digest('hex').slice(0, 12);
const buildRoot = path.resolve(environment.KOKI_ANDROID_BUILD_ROOT || path.join(os.tmpdir(), 'koki-android-builds', projectId));
environment.KOKI_ANDROID_BUILD_ROOT = buildRoot;

function run(command, args, cwd = root, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', windowsHide: true, shell: false });
    let stdout = '', stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    }
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(path.basename(command) + ' failed (' + (signal || code) + ').' + (capture ? '\n' + (stderr || stdout).slice(-4000) : '')));
    });
  });
}
const javaCandidates = [environment.JAVA_HOME, 'C:\\Program Files\\Android\\Android Studio\\jbr', path.join(os.homedir(), 'Applications', 'Android Studio.app', 'Contents', 'jbr', 'Contents', 'Home')].filter(Boolean);
let selectedJava;
for (const candidate of javaCandidates) {
  try {
    const release = await fs.readFile(path.join(candidate, 'release'), 'utf8');
    const major = Number(release.match(/JAVA_VERSION="(\d+)/)?.[1]);
    if (major >= 21) { selectedJava = candidate; break; }
  } catch { /* Try the next known JDK location. */ }
}
if (!selectedJava || !existsSync(path.join(selectedJava, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) throw new Error('JDK 21 or newer is required. Set JAVA_HOME or install Android Studio.');
environment.JAVA_HOME = selectedJava;
const java = path.join(selectedJava, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const keytool = path.join(selectedJava, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');

let uploadCertificate;
let certificatePem;
if (play) {
  const certificate = await run(keytool, ['-exportcert', '-rfc', '-keystore', environment.KOKI_UPLOAD_STORE_FILE, '-storepass:env', 'KOKI_UPLOAD_STORE_PASSWORD', '-alias', environment.KOKI_UPLOAD_KEY_ALIAS], root, true);
  certificatePem = certificate.stdout;
  uploadCertificate = new X509Certificate(certificatePem);
  if (/(?:^|\n|,)\s*CN\s*=\s*Android Debug(?:$|\n|,)/i.test(uploadCertificate.subject)) throw new Error('A debug certificate cannot sign a Play Store bundle. Initialize a separate production upload key.');
  const minimumExpiry = Math.max(Date.parse('2033-10-23T00:00:00Z'), Date.now() + 365 * 86400000);
  if (new Date(uploadCertificate.validTo).getTime() < minimumExpiry) throw new Error('Upload certificate must remain valid through 2033-10-23 and for at least another year. Generate a long-lived production upload key.');
  if (uploadCertificate.publicKey.asymmetricKeyType !== 'rsa' || (uploadCertificate.publicKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error('This release workflow requires an RSA upload key of at least 2048 bits; the initializer generates 4096 bits.');
}
const sdkCandidates = [environment.ANDROID_SDK_ROOT, environment.ANDROID_HOME, environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'Android', 'Sdk'), path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
const sdk = sdkCandidates.find((candidate) => existsSync(path.join(candidate, 'platforms')));
if (!sdk) throw new Error('Android SDK not found. Set ANDROID_HOME to the SDK shown in Android Studio.');
environment.ANDROID_HOME = sdk;
environment.ANDROID_SDK_ROOT = sdk;
environment.GRADLE_USER_HOME ||= path.join(root, '.cache', 'gradle');
await fs.mkdir(buildRoot, { recursive: true });
if (process.platform === 'win32' && !/jdk\.net\.unixdomain\.tmpdir=/.test(environment.JAVA_TOOL_OPTIONS || '')) {
  const socketDirectory = path.join(root, '.cache', 'jvm');
  await fs.mkdir(socketDirectory, { recursive: true });
  environment.JAVA_TOOL_OPTIONS = [environment.JAVA_TOOL_OPTIONS, '-Djdk.net.unixdomain.tmpdir="' + socketDirectory + '"'].filter(Boolean).join(' ');
}
const npmCli = environment.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!existsSync(npmCli)) throw new Error('Run this command with npm run android:build.');
const capacitorPackage = JSON.parse(await fs.readFile(path.join(root, 'node_modules', '@capacitor', 'cli', 'package.json'), 'utf8'));
const capacitorBin = typeof capacitorPackage.bin === 'string' ? capacitorPackage.bin : capacitorPackage.bin.capacitor || capacitorPackage.bin.cap;
const capacitor = path.join(root, 'node_modules', '@capacitor', 'cli', capacitorBin);
console.log('Android JDK: ' + environment.JAVA_HOME + '\nAndroid SDK: ' + sdk + '\nAndroid build cache: ' + buildRoot);
if (!flags.has('--skip-web')) await run(process.execPath, [npmCli, 'run', 'build']);
if (!existsSync(android)) await run(process.execPath, [capacitor, 'add', 'android']);
await run(process.execPath, [capacitor, 'sync', 'android']);
const localProperties = path.join(android, 'local.properties');
if (!existsSync(localProperties)) await fs.writeFile(localProperties, 'sdk.dir=' + sdk.replaceAll('\\', '/').replaceAll(':', '\\:') + '\n');
const variant = play || flags.has('--release') ? 'release' : flags.has('--debug') ? 'debug' : 'compact';
const tasks = play ? ['bundleRelease', 'assembleRelease'] : ['assemble' + variant[0].toUpperCase() + variant.slice(1)];
const gradleArgs = [...tasks, '--no-daemon', '--console=plain'];
if (process.platform === 'win32') await run(environment.ComSpec || 'cmd.exe', ['/d', '/c', '.\\gradlew.bat', ...gradleArgs], android);
else await run(path.join(android, 'gradlew'), gradleArgs, android);
if (play) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const gradleSource = await fs.readFile(path.join(android, 'app', 'build.gradle'), 'utf8');
  const versionName = gradleSource.match(/versionName\s+"([^"]+)"/)?.[1];
  const versionCode = Number(gradleSource.match(/versionCode\s+(\d+)/)?.[1]);
  if (!versionCode || versionName !== packageJson.version) throw new Error('Android and application versions do not match.');
  const bundlePath = path.join(buildRoot, 'app', 'outputs', 'bundle', 'release', 'app-release.aab');
  const apkPath = path.join(buildRoot, 'app', 'outputs', 'apk', 'release', 'app-release.apk');
  const jarsigner = path.join(selectedJava, 'bin', process.platform === 'win32' ? 'jarsigner.exe' : 'jarsigner');
  const jarVerification = await run(jarsigner, ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', bundlePath], root, true);
  if (!/jar verified\./i.test(jarVerification.stdout)) throw new Error('The Play bundle has no verified JAR signature.');
  const actualBundleCertificate = await run(keytool, ['-printcert', '-rfc', '-jarfile', bundlePath], root, true);
  const pem = actualBundleCertificate.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  if (!pem || new X509Certificate(pem[0]).fingerprint256 !== uploadCertificate.fingerprint256) throw new Error('Play bundle signer does not match the production upload certificate.');
  const buildTools = (await fs.readdir(path.join(sdk, 'build-tools'))).filter((name) => /^\d+\.\d+\.\d+$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const apksigner = buildTools.map((name) => path.join(sdk, 'build-tools', name, 'lib', 'apksigner.jar')).find(existsSync);
  if (!apksigner) throw new Error('Android SDK apksigner is required to verify the release APK.');
  const apkVerification = await run(java, ['-jar', apksigner, 'verify', '--print-certs', apkPath], root, true);
  const apkFingerprint = apkVerification.stdout.match(/Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i)?.[1]?.toLowerCase();
  const expectedFingerprint = uploadCertificate.fingerprint256.replaceAll(':', '').toLowerCase();
  if (apkFingerprint !== expectedFingerprint) throw new Error('Verification APK signer does not match the production upload certificate.');
  const destination = path.join(root, 'release', 'play-store');
  await fs.mkdir(destination, { recursive: true });
  const artifacts = [];
  for (const [source, name, purpose] of [
    [bundlePath, 'Koki-GBA-' + versionName + '-PlayStore.aab', 'Upload this bundle to Play Console.'],
    [apkPath, 'Koki-GBA-' + versionName + '-verification.apk', 'Local device testing only; Play distributes APKs signed with the Play app signing key.'],
  ]) {
    const bytes = await fs.readFile(source);
    await fs.writeFile(path.join(destination, name), bytes);
    artifacts.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose });
  }
  await fs.writeFile(path.join(destination, 'upload-certificate.pem'), certificatePem);
  const metadata = {
    version: versionName, versionCode, applicationId: 'com.koki.emulator', createdAt: new Date().toISOString(),
    buildType: 'release', minSdk: 24, targetSdk: 36,
    signing: { role: 'upload key', certificateSha256: expectedFingerprint, subject: uploadCertificate.subject, validTo: uploadCertificate.validTo, publicCertificate: 'upload-certificate.pem', bundleSignatureVerified: true, apkSignatureVerified: true },
    artifacts,
    previewMigration: 'Export a full library backup from the debug preview before uninstalling it. Production signing differs; Android cannot update the preview in place. Restore the backup after installing the Play version.',
    physicalDeviceTesting: 'Required before production; this build step does not certify gameplay or device testing.',
  };
  await fs.writeFile(path.join(destination, 'BUILD-INFO.json'), JSON.stringify(metadata, null, 2) + '\n');
  await fs.writeFile(path.join(destination, 'SHA256SUMS.txt'), artifacts.map((artifact) => artifact.sha256 + '  ' + artifact.file).join('\n') + '\n');
  console.log('Signed Play Store bundle and verification APK ready: ' + destination + '\nUpload certificate SHA-256: ' + expectedFingerprint);
} else if (variant !== 'release') {
  const release = path.join(root, 'release');
  await fs.mkdir(release, { recursive: true });
  const destination = path.join(release, 'koki-emulator-android-debug.apk');
  await fs.copyFile(path.join(buildRoot, 'app', 'outputs', 'apk', variant, 'app-' + variant + '.apk'), destination);
  console.log('APK ready: ' + destination);
} else {
  console.log('Release build ready under ' + path.join(buildRoot, 'app', 'outputs', 'apk', 'release') + '. Signing is enabled only when all production upload credentials are supplied.');
}
