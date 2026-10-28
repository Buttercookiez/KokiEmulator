# Emulator core attribution and contract

Koki uses the unmodified `mgba.js` and `mgba.wasm` artifacts from **@wasm-gaming/mgba-wasm 0.1.1**, built from the mGBA emulator. The application drives its published C shim with a separate TypeScript adapter; it does not copy the package's browser SDK.

- Wrapper and shim source: https://github.com/wasm-gaming/mGBA-wasm
- Published artifact: https://www.npmjs.com/package/@wasm-gaming/mgba-wasm/v/0.1.1
- mGBA source and copyright: https://github.com/mgba-emu/mgba (Jeffrey Pfau and contributors)
- License: Mozilla Public License 2.0, included in `licenses/MPL-2.0.txt` and copied beside the distributed core as `vendor/mgba/LICENSE.txt`.
- The wrapper's reproducible build script identifies its pinned upstream revision: https://github.com/wasm-gaming/mGBA-wasm/blob/main/scripts/build-mgba.sh

The core files are copied into `public/vendor/mgba/` by `scripts/sync-core.mjs` during installation and before builds. Both files must remain on the same local origin as the app. This build is single threaded and does not require SharedArrayBuffer or cross-origin isolation; that makes it suitable for a bundled Electron renderer and Android WebView.

The adapter supports GBA playback with the core's BIOS replacement, keyboard/touch/gamepad button input supplied by the UI, pause/resume, normal/fast/slow playback, audio, ordinary battery-save import/export, version-specific save states, screenshots, and a bounded rewind buffer. The application owns all persistent storage and identifies each cartridge by its content hash.

Rewind records one state every half second and keeps at most 40 states (approximately 20 seconds, at most 16 MiB). Rewinding silences audio and discards its queued samples. Fast/slow playback changes audio speed and pitch together. Battery saves are separate from emulator snapshots. States from other emulator builds, including My Boy!, are not treated as compatible.

Cheats, link cable networking, cartridge sensors, and rumble are not exposed by this single-threaded shim. They require a later core integration and are not presented as working features. No commercial games, proprietary BIOS files, or external runtime service are included.
