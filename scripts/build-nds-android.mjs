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
            s = s.replace(/versionCode \d+/, 'versionCode 2').replace(/versionName "[^"]+"/, 'versionName "0.1.1"');
        await fs.writeFile(p, s);
    }
} }
await adjust(destination);
await run(process.execPath, ['scripts/generate-nds-icons.cjs']);
await run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
await run(env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleCompact', '--no-daemon', '--console=plain'], destination);
await fs.mkdir(path.join(root, 'release-nds'), { recursive: true });
await fs.copyFile(path.join(env.KOKI_ANDROID_BUILD_ROOT, 'app/outputs/apk/compact/app-compact.apk'), path.join(root, 'release-nds/Koki-NDS-0.1.1-Android.apk'));
console.log('Separate NDS preview APK ready; GBA app/downloads unchanged.');
