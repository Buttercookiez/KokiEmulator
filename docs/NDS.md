# Koki NDS 0.1.0

An experimental Nintendo DS app built from the same React interface and native shells as Koki GBA. It shares the library, colors, splash animation, saves UI, mobile game drawer and touch-layout editor. There is no copied second frontend to keep in sync.

## Try it locally

The generated files are in the ignored release-nds folder:

- Windows x64: Koki-NDS-0.1.0-Windows.exe (portable executable, about 103 MB).
- Android: Koki-NDS-0.1.0-Android.apk (compact debug-signed preview, about 1.56 MB; Android 7 or newer).
- BUILD-INFO.json and SHA256SUMS.txt record package checks and artifact identities.

These local files are not published downloads or Play Store submissions. Windows and Android identify this app as Koki NDS / com.koki.nds, so it can coexist with Koki GBA. NDS has its own private library, settings, saves and backups. Uninstalling the Android app removes its private data; export a backup first.

Open the app, choose Add games and import your own .nds, .srl or ZIP file. No commercial games or Nintendo BIOS files are bundled. The core uses its FreeBIOS fallback and generated firmware for direct DS boot. It does not offer DSi mode or a firmware menu.

## Screens and controls

The existing immersive player adds Stacked screens, Side by side, Touchscreen only and Swap screens. Click or touch the lower DS screen to use the stylus. Letterboxing, screen swapping and picture placement are included in coordinate mapping.

The same compact keyboard layout applies: WASD or arrows for direction, X/Z or J/K for A/B, Q/E for L/R, Enter and Right Shift for Start/Select. DS X/Y default to I/U; change them in Settings or in a game profile. Space pauses, F5 creates a checkpoint and F8 restores one. Standard gamepads include X/Y.

On mobile, use the upper-right game drawer for screen options, saves and playback functions. Edit controls lets you resize and move X/Y along with the existing buttons. Portrait and landscape layouts, screen size/position and per-game profiles use the shared editor. Both apps retain the same color choices and startup animation.

Battery .sav files, screenshot checkpoints, automatic resume, recovery checkpoints, full-library ZIP backups, custom covers, screenshots, audio output, speed and bounded rewind are integrated. Checkpoints are specific to this pinned core; other emulators' state formats are not interchangeable. NDS and GBA backups reject each other's manifest format.

Individual DS ROMs may be up to 512 MB; backup imports and decompressed backup data are limited to 512 MB in total. Large games and states can require considerably more memory than their file size, especially in the Android WebView. Rewind history is capped at 32 MB and may retain fewer seconds than the chosen setting.

Library artwork shows the visible DS screen when the other panel is blank, with matching rounded corners. Original screenshots and checkpoint previews retain both screens. The NDS wordmark label uses a small subscript position.

## Develop and build

Use Node 22.12+ and npm. Android additionally requires SDK 36, JDK 21+ and the existing Android build tools. Windows packages use Electron x64. Icon generation and integration checks use Playwright with Microsoft Edge installed.

~~~sh
npm ci
npm run nds:dev
~~~

The DS preview runs at http://127.0.0.1:5175. The first NDS command downloads the exact pinned JS/WASM core and validates its size/hash. Later builds reuse the verified local cache; installed apps do not download it at runtime.

~~~sh
npm run nds:build
npm run nds:desktop
npm run nds:android
~~~

NDS builds write dist-nds, release-nds and a generated android-nds project. The original android project supplies the native template; its package identity is rewritten only in the generated NDS copy. GBA commands, output folders and signing material remain separate. NDS Android previews use the compact debug signing configuration, not the GBA production upload key.

## Verification

~~~sh
npm test
npm run nds:diagnostic
# With nds:dev running in another terminal:
npm run test:nds
# After nds:build, without requiring the dev server:
npm run test:nds:native
# After building both native packages:
npm run nds:verify
~~~

The diagnostic generator creates an original 64 KB homebrew executable in .cache/nds-tests/koki-ds-diagnostic.nds. It contains no Nintendo logo or proprietary game data. Its ARM9 program paints the top screen blue (red while A is held) and the bottom screen green; the ARM7 program idles. You can import that file to perform a basic local check.

Verified on the development PC: real ARM9/ARM7 emulation; two distinct framebuffers; keyboard A input; screen layouts and swapping; large checkpoints and auto-resume after reload; ZIP export and restore in a fresh browser profile; mobile X/Y presence and resize persistence; saved keyboard remapping; production app:// loading and native Windows filesystem saves in an isolated test profile. Package checks compare every frontend asset with the APK and Windows app archive.

Not yet verified: physical Android devices, commercial DS games, broad game compatibility, sustained performance or audible DS output. The original diagnostic does not exercise sound or stylus hardware; coordinate mapping has unit coverage, but game-level stylus compatibility still needs testing. This single-thread interpreter is a starting point; demanding games may run slowly. Multiplayer, microphone, camera and DSi functionality are not connected.

## Core provenance and public-release gate

engines/nds-manifest.json pins the unmodified Pilas melonDS web-port artifacts to revision 4aee467df214df7f2f346bcba2219dd7bfafc4b2, including exact download URLs, lengths and SHA-256 hashes. scripts/sync-nds.mjs verifies them before use. The cache is ignored by Git; the app bundles the core, its upstream license and this provenance manifest. MPL-2.0 is available in the offline license reader.

Upstream port: https://github.com/josepilas/pilas-melonds/tree/4aee467df214df7f2f346bcba2219dd7bfafc4b2

Upstream melonDS: https://github.com/melonDS-emu/melonDS

The pinned port snapshot contains deployed JS/WASM artifacts, its browser integration and license. The corresponding C++ shim and reproducible build tree have not been located in that snapshot. Confirm their corresponding source availability before distributing public NDS binaries; if they cannot be obtained, replace the port with a source-buildable integration. Current binaries are local experimental previews, and no NDS binary release or store listing has been published.
