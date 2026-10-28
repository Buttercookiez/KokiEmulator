import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const environment = { ...process.env };
const projectId = createHash('sha256').update(root).digest('hex').slice(0, 12);
const buildRoot = path.resolve(environment.KOKI_ANDROID_BUILD_ROOT || path.join(os.tmpdir(), 'koki-android-builds', projectId));
environment.KOKI_ANDROID_BUILD_ROOT = buildRoot;
await fs.mkdir(buildRoot, { recursive: true });

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${signal || code}).`)));
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

const sdkCandidates = [environment.ANDROID_SDK_ROOT, environment.ANDROID_HOME, environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'Android', 'Sdk'), path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
const sdk = sdkCandidates.find((candidate) => existsSync(path.join(candidate, 'platforms')));
if (!sdk) throw new Error('Android SDK not found. Set ANDROID_HOME to the SDK shown in Android Studio.');
environment.ANDROID_HOME = sdk;
environment.ANDROID_SDK_ROOT = sdk;
environment.GRADLE_USER_HOME ||= path.join(root, '.cache', 'gradle');
if (process.platform === 'win32' && !/jdk\.net\.unixdomain\.tmpdir=/.test(environment.JAVA_TOOL_OPTIONS || '')) {
  // MSIX-launched JVMs can virtualize TEMP paths and break NIO loopback sockets.
  // Keep these short-lived sockets in a real project folder instead.
  const socketDirectory = path.join(root, '.cache', 'jvm');
  await fs.mkdir(socketDirectory, { recursive: true });
  environment.JAVA_TOOL_OPTIONS = [environment.JAVA_TOOL_OPTIONS, `-Djdk.net.unixdomain.tmpdir="${socketDirectory}"`].filter(Boolean).join(' ');
}

const npmCli = environment.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!existsSync(npmCli)) throw new Error('Run this command with npm run android:build.');
const capacitorPackage = JSON.parse(await fs.readFile(path.join(root, 'node_modules', '@capacitor', 'cli', 'package.json'), 'utf8'));
const capacitorBin = typeof capacitorPackage.bin === 'string' ? capacitorPackage.bin : capacitorPackage.bin.capacitor || capacitorPackage.bin.cap;
const capacitor = path.join(root, 'node_modules', '@capacitor', 'cli', capacitorBin);

console.log(`Android JDK: ${environment.JAVA_HOME}\nAndroid SDK: ${sdk}\nAndroid build cache: ${buildRoot}`);
if (!process.argv.includes('--skip-web')) await run(process.execPath, [npmCli, 'run', 'build']);
if (!existsSync(android)) await run(process.execPath, [capacitor, 'add', 'android']);
await run(process.execPath, [capacitor, 'sync', 'android']);
const localProperties = path.join(android, 'local.properties');
if (!existsSync(localProperties)) await fs.writeFile(localProperties, 'sdk.dir=' + sdk.replaceAll('\\', '/').replaceAll(':', '\\:') + '\n');
const variant = process.argv.includes('--release') ? 'release' : process.argv.includes('--debug') ? 'debug' : 'compact';
const task = 'assemble' + variant[0].toUpperCase() + variant.slice(1);
if (process.platform === 'win32') await run(environment.ComSpec || 'cmd.exe', ['/d', '/c', '.\\gradlew.bat', task, '--no-daemon', '--console=plain'], android);
else await run(path.join(android, 'gradlew'), [task, '--no-daemon', '--console=plain'], android);
if (variant !== 'release') {
  const release = path.join(root, 'release');
  await fs.mkdir(release, { recursive: true });
  const destination = path.join(release, 'koki-emulator-android-debug.apk');
  await fs.copyFile(path.join(buildRoot, 'app', 'outputs', 'apk', variant, 'app-' + variant + '.apk'), destination);
  console.log(`APK ready: ${destination}`);
} else console.log(`Unsigned release build ready under ${path.join(buildRoot, 'app', 'outputs', 'apk', 'release')}.`);
