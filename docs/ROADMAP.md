# Selected feature roadmap

The first playable build focuses on local play and dependable saves. Planned items are visible in the app's About dialog and are not presented as working controls.

| Area | First playable build | Remaining work |
| --- | --- | --- |
| Emulation | Bundled mGBA, audio, BIOS replacement | Compatibility testing across a larger homebrew and user-provided collection |
| Files | GBA/BIN/ZIP imports, folder import, SHA-256 deduplication | IPS/UPS/BPS patching and patch profiles |
| Saves | Battery import/export, checkpoints, auto-resume, restore previews, backup reminders, backup before restore/reset | Save-version migration and larger streaming backups |
| Controls | Remappable keyboard, per-game key maps, standard gamepads, multi-touch, opacity, position/size editor, portrait/landscape presets, per-game touch profiles, eight-way gestures, turbo A/B, touch haptics | Additional controller profiles |
| Speed and display | Slow motion, fast-forward, rewind, per-game speed/filter, picture placement/size, Android immersive bars, pixel/smooth/LCD display | GLSL shader pipeline |
| Library | Search, favorites, covers, list/grid, sort | English-language metadata catalog, revision filters, collections |
| Link cable | Planned | Same-device link emulation, then nearby Wi-Fi/Bluetooth; My Boy! interoperability needs independent validation |
| Cheats | Planned | GameShark/Action Replay/CodeBreaker/raw code support through a verified core interface |
| Cartridge hardware | Planned | Tilt, gyroscope, solar sensor and rumble integration |
| Cloud | Optional and planned | User-selected provider, conflict resolution, recovery, account setup |
| Capture | Screenshots | Gameplay recording |

The single-threaded WASM build works across desktop and Android without SharedArrayBuffer. It does not currently expose link cable, cheat, or sensor APIs. Those features need a core/shim extension and platform testing rather than interface-only switches.

Game downloads are limited to authorized releases and homebrew. A complete English metadata catalog can exist independently of which game files the user imports. No automatic commercial ROM collection download is included.
