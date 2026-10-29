# Koki NDS 0.1.3 experimental preview

Koki NDS shares Koki GBA's library, themes, original logo, splash, settings, saves UI and touch editor. Version 0.1.1 replaces the earlier private preview's binary-only port with a source-built SkyEmu DS engine.

Version 0.1.2 keeps the same engine and checkpoint format as 0.1.1. It aligns the NDS wordmark label and transfers Android files in 256 KB chunks, avoiding whole-ROM base64 copies in the Java heap. Incomplete writes remain separate from completed recovery files. Backup exports use the same bounded transfers.

Version 0.1.3 lowers the small NDS label to the wordmark baseline. The 0.1.2 storage fix and engine/checkpoint format are unchanged.

## Downloads

The public release is nds-v0.1.3 in https://github.com/Buttercookiez/KokiEmulator/releases. It provides Koki-NDS-0.1.3-Windows.exe, Koki-NDS-0.1.3-Android.apk, checksums, verification notes and Koki-NDS-0.1.3-source.zip. The website provides system-specific download links at /nds/.

Windows is a portable x64 app. The Android APK requires Android 7+ and a current WebView. This experimental APK uses the existing NDS debug signing key; the Windows app is unsigned. These are direct preview downloads, not a Google Play release. Close a previous Windows NDS instance before starting the updated executable.

NDS has a separate app identity (com.koki.nds), library and settings from GBA. Updating the existing NDS APK preserves its private data. Uninstalling removes that data; export a full library backup first.

## Upgrading the earlier private preview

Save inside the game and export a library backup in the old app before updating, especially if progress exists only in a checkpoint. The new engine supports compatible raw .sav files but cannot load the earlier port's checkpoints.

The first launch keeps the previous index and battery saves in the private library's nds/migrations/pre-0.1.1 folder. Earlier checkpoints stay in history as recovery entries and are not pruned by the new engine's automatic rotation. Automatic resume selects only this engine's checkpoints; selecting an earlier checkpoint displays an explanation. No game file is removed or replaced.

An existing save whose size differs from the new core's expected save size is rejected instead of truncated. Your original .sav and its migration copy remain available. Return to the old preview and export an in-game save if needed.

## Play

Import your own .nds, .srl or ZIP file. No games or Nintendo BIOS files are included. The engine uses an open BSD-licensed BIOS replacement and generated firmware for direct DS boot. DSi, multiplayer, microphone and camera are not connected.

Choose stacked, side-by-side or touchscreen-only layouts, and swap screens. Desktop gameplay is centered. Click or touch the lower screen to use the pen. Mobile screen choices and gameplay functions live in the upper-right drawer. Edit controls resizes and moves X/Y and the other buttons, with portrait, landscape and per-game layouts.

WASD or arrows move; X/Z or J/K are A/B; Q/E are L/R; Enter/Right Shift are Start/Select; I/U are DS X/Y. Remap these in Settings or a game profile. Space pauses, F5 creates a checkpoint, F8 restores one. Standard gamepads include X/Y.

The shared app provides local .sav import/export, auto-resume, named checkpoints, recovery before restore, backup ZIPs, custom covers, screenshots, audio output, display filters, speed, turbo A/B and bounded rewind. New stored checkpoints are compressed; in-memory rewind is capped at 32 MB and may retain fewer seconds than selected. Library artwork omits a wholly blank DS panel; original screenshots remain complete.

ROMs may be up to 512 MB, but large games need substantially more memory than their file size. Full backup imports and decompressed data are capped at 512 MB. Performance and compatibility vary by game and device.

## Build

Node 22.12+ and npm are required. Android additionally needs SDK 36 and JDK 21+. Icon generation and integration checks use Playwright with Microsoft Edge.

~~~sh
npm ci
npm run nds:dev
npm run nds:build
npm run nds:desktop
npm run nds:android
~~~

The local DS preview is http://127.0.0.1:5175. Build outputs are dist-nds, release-nds and the generated android-nds native project. GBA commands, downloads and production signing remain separate. Installed apps never download their core at runtime.

The NDS sync command verifies the release's JS/WASM hashes before staging them. Rebuilding the engine from source requires Emscripten 4.0.23; see NDS-CORE.md. Source inputs and produced files have committed manifests, and complete source and notices accompany the release.

## Verification and limits

~~~sh
npm test
npm run test:nds
npm run test:nds:native
npm run nds:verify
~~~

For test:nds, run nds:dev in another terminal. Native checks need nds:build first. The package verifier expects both newly built native packages and the unpacked Windows staging directory.

The generated .cache/nds-tests/koki-ds-diagnostic.nds is original homebrew with no Nintendo logo or proprietary game data. Its top screen is blue and bottom green. A makes the top red; X makes it green; Y makes it magenta; the pen makes it yellow. ARM7 publishes the real X/Y/pen hardware register to ARM9.

Checks cover real ARM9/ARM7 execution, dual framebuffers, A/X/Y input, pen hardware, layouts/swapping, compressed checkpoints and instance rebasing, auto-resume, ZIP restore, mobile control sizing, key remapping, desktop native storage and byte-for-byte native package contents. One existing imported game was smoke-tested locally for boot frames, nonzero PCM audio and byte-preserving save import. This is not a full-game or broad compatibility test. Physical Android device testing remains pending.

Read the release verification notes for the final Android-emulator runtime results. Public downloads are explicitly experimental. The source-built engine is MIT-licensed; BIOS replacement, ROM database and compiler/runtime notices are bundled in the app and source archive.
