import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'android-psp');
const runtime = path.resolve(process.env.KOKI_PSP_ANDROID_RUNTIME || path.join(root, '.cache/psp-android-runtime'));
const system = path.resolve(process.env.KOKI_PSP_RUNTIME || path.join(root, '.cache/psp-runtime'), 'system');
const abi = process.env.KOKI_PSP_ABI || 'arm64-v8a';
if (!['arm64-v8a', 'x86_64'].includes(abi)) throw Error('Unsupported PSP Android architecture.');
const testing = process.argv.includes('--test');
const env = { ...process.env, KOKI_SYSTEM: 'psp',
  JAVA_HOME: process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr',
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk'),
  KOKI_ANDROID_BUILD_ROOT: path.join(os.tmpdir(), 'koki-psp-android-' + abi + (testing ? '-test' : '')),
};
let javaFound = false;
for (const candidate of [process.env.JAVA_HOME, 'C:/Program Files/Android/Android Studio/jbr'].filter(Boolean)) {
  try {
    const release = await fs.readFile(path.join(candidate, 'release'), 'utf8');
    if (Number(release.match(/JAVA_VERSION="(\d+)/)?.[1]) >= 21) { env.JAVA_HOME = candidate; javaFound = true; break; }
  } catch {}
}
if (!javaFound) throw Error('PSP Android builds require Java 21 or newer.');
const jvmTemp = path.join(os.tmpdir(), 'koki-jvm');
await fs.mkdir(jvmTemp, { recursive: true });
env.JAVA_TOOL_OPTIONS = [process.env.JAVA_TOOL_OPTIONS, '-Djdk.net.unixdomain.tmpdir="' + jvmTemp + '"'].filter(Boolean).join(' ');
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
function run(exe, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(Error('PSP Android build failed (' + code + ').')));
  });
}
await fs.access(path.join(runtime, abi, 'ppsspp_libretro_android.so'));
await fs.access(path.join(system, 'PPSSPP/compat.ini'));
if (!process.argv.includes('--skip-web')) await run(process.execPath, ['scripts/build-psp.mjs', '--renderer-only']);
await fs.cp(path.join(root, 'android'), destination, { recursive: true,
  filter: file => !/(?:^|[\\/])(?:build|\.gradle|\.kotlin|\.idea|capacitor-cordova-android-plugins)(?:[\\/]|$)/.test(file) &&
    !file.replaceAll('\\', '/').includes('/assets/public') && !file.endsWith('local.properties'),
});
async function adjust(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await adjust(file);
    else if (/\.(java|xml|gradle)$/.test(entry.name)) {
      let text = await fs.readFile(file, 'utf8');
      text = text.replaceAll('com.koki.emulator', 'com.koki.psp').replaceAll("Koki\\'s Emulator", 'Koki PSP').replaceAll("Koki's Emulator", 'Koki PSP');
      if (entry.name === 'build.gradle' && folder.endsWith(path.sep + 'app')) {
        text = text.replace(/versionCode \d+/, 'versionCode 1').replace(/versionName "[^"]+"/, 'versionName "0.2.0"')
          .replace('minSdkVersion rootProject.ext.minSdkVersion', 'minSdkVersion 26');
      }
      if (entry.name === 'MainActivity.java') text = text.replace('registerPlugin(PlayerUiPlugin.class);', 'registerPlugin(PlayerUiPlugin.class);\n        registerPlugin(com.koki.psp.NativePspPlugin.class);');
      if (entry.name === 'AndroidManifest.xml') text = text.replace('<application', '<uses-feature android:glEsVersion="0x00030000" android:required="true" />\n    <application android:extractNativeLibs="true"');
      if (entry.name === 'file_paths.xml') text = text.replace('</paths>', '    <cache-path name="psp_exports" path="psp-exports/" />\n</paths>');
      await fs.writeFile(file, text);
    }
  }
}
await adjust(destination);
await fs.cp(path.join(root, 'native/psp/java'), path.join(destination, 'app/src/main/java'), { recursive: true });
const libFolder = path.join(destination, 'app/src/main/jniLibs', abi);
await fs.mkdir(libFolder, { recursive: true });
await fs.copyFile(path.join(runtime, abi, 'ppsspp_libretro_android.so'), path.join(libFolder, 'libppsspp_libretro.so'));
await fs.cp(system, path.join(destination, 'app/src/main/assets/psp-system'), { recursive: true });
await fs.cp(path.join(root, 'licenses/psp'), path.join(destination, 'app/src/main/assets/psp-licenses'), { recursive: true });
await fs.appendFile(path.join(destination, 'app/build.gradle'), `
android {
    ndkVersion "28.2.13676358"
    defaultConfig {
        ndk { abiFilters '${abi}' }
        externalNativeBuild { cmake { arguments '-DANDROID_STL=c++_static' } }
    }
    externalNativeBuild { cmake {
        path file('../../native/psp/CMakeLists.txt')
        version '3.22.1'
        buildStagingDirectory file('../../.cache/native-psp/${abi}')
    } }
    packaging { jniLibs { useLegacyPackaging = true } }
}
`);
await run(process.execPath, ['scripts/generate-psp-icons.cjs']);
await run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
const variant = testing ? 'debug' : 'compact';
await run(env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradlew.bat', 'assemble' + (testing ? 'Debug' : 'Compact'), '--no-daemon', '--console=plain'], destination);
await fs.mkdir(path.join(root, 'release-psp'), { recursive: true });
const output = path.join(root, 'release-psp', 'Koki-PSP-0.2.0-' + (testing ? abi + '-test' : abi === 'arm64-v8a' ? 'Android' : abi + '-preview') + '.apk');
await fs.copyFile(path.join(env.KOKI_ANDROID_BUILD_ROOT, 'app/outputs/apk', variant, 'app-' + variant + '.apk'), output);
console.log(output);
