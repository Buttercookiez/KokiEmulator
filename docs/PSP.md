# Koki PSP 0.2.3

Koki PSP provides the Koki library interface on Windows x64 and Android arm64.
The Android APK requires Android 8 or newer and OpenGL ES 3. It uses the native
PPSSPP libretro engine with JIT and hardware graphics at the original 480 × 272
resolution. The Windows build retains the existing native PPSSPP software
renderer and supports the previous Windows library and checkpoints.

## Using the app

- Add games accepts ZIP, ISO, CSO, CHD, PBP, ELF and PRX. ZIP imports preserve
  related homebrew files. Android streams imports from the system file picker
  into private storage. Windows opens individual game files in their original
  location and extracts ZIPs into its private library. Source ZIPs are retained.
- Library supports search, sorting, grid/list views, favorites, a recent game,
  and game artwork from captured screenshots.
- Save creates a compressed checkpoint. Saves lists the checkpoint history by
  game. Resume game loads the newest checkpoint when available. In-game saves
  use the PSP memory stick. Windows opens the memory-stick folder. Android
  exports it as a ZIP through the system share sheet.
- In the player menu, Edit controls lets you drag PSP buttons and the analog
  stick, adjust opacity and size, and save the layout for all PSP games.
  Portrait and landscape layouts are remembered separately.
- Settings provides light/dark/system appearance, Koki color palettes, volume,
  image scaling and touch-control visibility. External standard gamepads work
  alongside keyboard and touch input.
- Android pauses when the app moves to the background. Resume explicitly when
  returning. Closing a game unloads the native engine and flushes in-game saves.

## Build

Install the repository's pinned Node dependencies with npm ci. Android builds
also require Java 21+, Android SDK 36, NDK 28.2.13676358 and CMake 3.22.1.

Run npm run psp:desktop for the Windows executable. The runtime defaults to
.cache/psp-runtime, or set KOKI_PSP_RUNTIME to another directory. It contains
python/python.exe, core/ppsspp_libretro.dll and system/PPSSPP/compat.ini with
the matching system assets.

Run npm run psp:android for the Android APK. Put the official Android PPSSPP
libretro binary at .cache/psp-android-runtime/arm64-v8a/ppsspp_libretro_android.so,
or set KOKI_PSP_ANDROID_RUNTIME. The script creates android-psp from the common
Android shell, copies Koki's PSP native integration and system assets, and builds
a compact APK signed with the local development certificate. A Google Play AAB
requires a separately configured release build and upload signing.

Outputs are release-psp/Koki-PSP-0.2.3-Windows.exe and
release-psp/Koki-PSP-0.2.3-Android.apk. Generated Android projects, native
binaries and installers are excluded from Git.

## Validation

Set KOKI_PSP_DEMO to the path to PPSSPP's cube.elf homebrew demo and
KOKI_PSP_RUNTIME to the Windows runtime, then run npm run test:psp.
It checks real gameplay, checkpoint save/restore, screenshots, appearance,
mobile navigation and controller changes carried between games in an isolated
profile. No ROMs are distributed with Koki PSP.

scripts/test-psp-android.mjs targets the dedicated emulator-5560 test device
with an installed debuggable com.koki.psp build. Install Playwright's Android
driver with npx playwright install android. The test checks the real system ZIP
picker, native graphics, checkpoint save/restore, rotation, and shared controls.
Build that APK with KOKI_PSP_ABI=x86_64 and node scripts/build-psp-android.mjs --test.
Performance on physical phones and a wider game library still needs testing.

## Licensing and public distribution

The Koki PSP native integration and shared audio pump are GPL-3.0-or-later.
PPSSPP is copyright Henrik Rydgard and contributors, GPL-2.0-or-later.
See licenses/psp for the bundled license texts, notices and runtime hashes.
The engine comes from the official Libretro PPSSPP builds.

These installers are local testing builds. Before public distribution, archive
and provide the exact corresponding PPSSPP source, submodules, build instructions,
and all dependency notices for the bundled binaries.

Upstream sources
- https://github.com/hrydgard/ppsspp
- https://docs.libretro.com/library/ppsspp/
- https://www.ppsspp.org/legacybuilds/#cube-test-program
