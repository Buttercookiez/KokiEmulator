import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'android-nds');
const env = { ...process.env, KOKI_SYSTEM: 'nds', JAVA_HOME: process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr', ANDROID_HOME: process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk'), KOKI_ANDROID_BUILD_ROOT: path.join(os.tmpdir(), 'koki-nds-android-build') };
let javaFound = false;
for (const candidate of [process.env.JAVA_HOME, 'C:/Program Files/Android/Android Studio/jbr'].filter(Boolean)) {
    try {
        const release = await fs.readFile(path.join(candidate, 'release'), 'utf8');
        if (Number(release.match(/JAVA_VERSION="(\d+)/)?.[1]) >= 21) {
            env.JAVA_HOME = candidate;
            javaFound = true;
            break;
        }
    }
    catch { }
}
if (!javaFound)
    throw Error('NDS Android builds need JDK21 or newer.');
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
await fs.mkdir(path.join(root, '.cache/jvm'), { recursive: true });
env.JAVA_TOOL_OPTIONS = [env.JAVA_TOOL_OPTIONS, '-Djdk.net.unixdomain.tmpdir="' + path.join(root, '.cache/jvm') + '"'].filter(Boolean).join(' ');
function run(exe, args, cwd = root) { return new Promise((resolve, reject) => { const c = spawn(exe, args, { cwd, env, stdio: 'inherit', windowsHide: true }); c.on('error', reject); c.on('exit', code => code === 0 ? resolve() : reject(Error('NDS Android build failed: ' + code))); }); }
await run(process.execPath, ['scripts/sync-nds-native.mjs']);
if (!process.argv.includes('--skip-web'))
    await run(process.execPath, ['scripts/nds.mjs', 'build']);
await fs.cp(path.join(root, 'android'), destination, { recursive: true, filter: p => !/(?:^|[\\/])(?:build|\.gradle|\.kotlin|\.idea|capacitor-cordova-android-plugins)(?:[\\/]|$)/.test(p) && !p.replaceAll('\\', '/').includes('/assets/public') });
async function adjust(folder) { for (const e of await fs.readdir(folder, { withFileTypes: true })) {
    const p = path.join(folder, e.name);
    if (e.isDirectory())
        await adjust(p);
    else if (/\.(java|xml|gradle)$/.test(e.name)) {
        let s = await fs.readFile(p, 'utf8');
        s = s.replaceAll('com.koki.emulator', 'com.koki.nds').replaceAll("Koki\\'s Emulator", 'Koki NDS').replaceAll("Koki's Emulator", 'Koki NDS');
        if (e.name === 'build.gradle' && folder.endsWith(path.sep + 'app'))
            s = s.replace(/versionCode \d+/, 'versionCode 6').replace(/versionName "[^"]+"/, 'versionName "0.2.0"');
        await fs.writeFile(p, s);
    }
} }
await adjust(destination);
await fs.cp(path.join(root,'native/nds/java'),path.join(destination,'app/src/main/java'),{recursive:true});
const activity=path.join(destination,'app/src/main/java/com/koki/emulator/MainActivity.java');
let activitySource=await fs.readFile(activity,'utf8');
activitySource=activitySource.replace('registerPlugin(PlayerUiPlugin.class);','registerPlugin(PlayerUiPlugin.class);\n        registerPlugin(com.koki.nds.NativeNdsPlugin.class);');
await fs.writeFile(activity,activitySource);
const abis=(process.env.KOKI_NDS_ABIS||'arm64-v8a').split(',');
if(abis.some(a=>!['arm64-v8a','x86_64'].includes(a)))throw Error('Unsupported NDS ABI');
await fs.appendFile(path.join(destination,'app/build.gradle'),`\nandroid {\n ndkVersion "27.1.12297006"\n defaultConfig { ndk { abiFilters ${abis.map(a=>"'"+a+"'").join(',')} }\n externalNativeBuild { cmake { arguments '-DANDROID_STL=c++_static' } } }\n externalNativeBuild { cmake { path file('../../native/nds/CMakeLists.txt'); version '3.22.1'; buildStagingDirectory file('../../.cache/native-nds/gradle') } }\n}\n`);
await run(process.execPath, ['scripts/generate-nds-icons.cjs']);
await run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
await run(env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleCompact', '--no-daemon', '--console=plain'], destination);
await fs.mkdir(path.join(root, 'release-nds'), { recursive: true });
await fs.copyFile(path.join(env.KOKI_ANDROID_BUILD_ROOT, 'app/outputs/apk/compact/app-compact.apk'), path.join(root, process.env.KOKI_NDS_ABIS === 'x86_64' ? 'release-nds/Koki-NDS-0.2.0-x86_64-test.apk' : 'release-nds/Koki-NDS-0.2.0-Android.apk'));
console.log('Separate NDS preview APK ready; GBA app/downloads unchanged.');
