# Validation

## Version 0.3.0: game profiles, mobile layout and smaller builds

Optional game profiles persist speed, screen filter and key mappings separately from global defaults. In-game speed writes to the active profile; disabling it resumes current defaults. Normalization, concurrent edits, missing-game errors, legacy data and backup round trips pass seven new tests, for 51 unit/filesystem tests total. Browser checks use the real core to verify profile isolation, custom keys, live speed, reloads and reset-to-default behavior. Shared remapping retains reserved-key and duplicate-key handling. Phone checks cover 320 px layouts, floating navigation, larger game buttons, a fixed modal close area, scrolling restoration, grouped saves and fullscreen auto-hiding controls. Packaged Windows checks include profile persistence, native save/OS-close/relaunch and the existing local library bridge.

Windows production files contain no duplicate dependency packages or source maps, and one English runtime locale. The web bundle uses one local Latin font subset; other scripts use system font fallbacks. The pinned offline WASM core and fallback rendering components remain intact. Android uses R8 code/resource shrinking, retained bridge/plugin entry points, and the existing debug signing identity. Exact package sizes and asset integrity results are recorded in release/BUILD-INFO.json. The optimized APK passes an API 36 x86_64 emulator run: local file-picker import, game rendering, green/red touch input, manual and automatic checkpoints, relaunch persistence (three checkpoints), and checkpoint restore. No native crashes were logged. The run used a fresh temporary base image, leaving the existing locked AVD and its user-data overlay untouched. Physical Android device testing remains pending.

## Version 0.2.1: Save history by game

Save history groups checkpoints by cartridge identity, with newest game groups and checkpoints first. Each game has its own cover, title, count and keyboard-accessible collapsible section; checkpoint rows omit the repeated game title. Deleting the last checkpoint removes only its group. The Add games chevron is removed while file/folder import and backup restoration remain available. A focused browser check uses real diagnostic states for two different games to verify grouping, counts, order, collapse, correct-game restore, isolated deletion, reload persistence, and light/dark layouts down to 320 px. Production TypeScript/Vite builds pass. Android device runtime testing remains pending; final package checks are recorded in release/BUILD-INFO.json.

## Version 0.2.0: compact controls and immersive play

The library uses concise headings, removes decorative status dots and repeated labels, fixes Resume hover contrast, remembers a collapsible sidebar, and keeps the top bar attached during scrolling. WASD and arrow-key movement work alongside Q/E shoulders and X/Z or J/K actions; explicit custom mappings remain authoritative. The player fills the viewport without reserved bars and keeps the original 3:2 picture. Mouse/touch or Tab reveals controls; two idle seconds hide them, except while paused, using menus, focusing controls, or holding touch inputs. Fullscreen denial retains full-window gameplay, Escape exits fullscreen without closing the game, and save-and-return restores the library. Mobile portrait/landscape and keyboard/touch overlap are covered by real WASM checks.

All 44 unit/filesystem checks pass. Browser integration covers library navigation, theme and cover persistence, dropdowns, compact movement, snapshots, backups, and the two-second player behavior. A repeated save/resume regression found that fresh-core battery import must happen after checkpoint save-memory initialization; the adapter now applies battery bytes after that initialization. Direct cold-boot and checkpoint tests retain a separate SRAM sentinel. Android device runtime testing remains pending. The final packaged Windows app passes native file storage, OS-close auto-save, and relaunch/resume checks in an isolated profile. Windows/Android assets match dist; release/BUILD-INFO.json and SHA256SUMS.txt record the final files. The updated app was opened through Explorer and visually verified with the existing desktop library and saved theme. Launching directly from an MSIX-hosted automation process can expose a separate package-virtualized Roaming profile; use the desktop shell to reopen the ordinary desktop profile. Both profiles are left intact.

## Version 0.1.7: Windows package storage paths

Recognized Windows package Roaming mirrors resolve to one validated physical library root for all I/O. Existing canonical host indexes reject mixed-root adoption. Link/path guards remain intact, temporary cleanup stays at the owned probe name, and canonical rename validates the open file identity. All 37 unit/filesystem checks pass, including existing/empty merged profiles, concurrent first writes, rejected redirects, linked roots, and protected-file cleanup. A verified safety copy of the existing user library was made before the fix; all five games and eight checkpoints remain intact. The separate Colors page and saved palette choices are retained.

## Version 0.1.6: separate Colors page

The palette button opens a standalone Colors page with light/dark/system controls, presets, and a custom picker. Settings contains display and emulator options without palette controls. Browser checks verify the separate destination, absence of palettes in Settings, navigation back through the palette button, saved choices, backups, and responsive layout. Existing library, input, save/resume, and dropdown checks also pass. Android device runtime testing remains pending.

## Version 0.1.5: light and dark color palettes

Sixteen named palettes and custom hex/picker colors can be saved independently for light and dark modes. System mode follows device changes using the matching saved color. Thirty-one unit/filesystem checks pass, including legacy-library migration, backup preferences, all preset text/accent contrast pairs, and 78 arbitrary/extreme custom colors in both modes. Browser checks pass for preset arrows, custom draft reset and validation, native color change events, independent modes, live previews, reload/backup persistence, mobile controls, and the original holder-free library. Existing library/play/save/resume and dropdown checks also pass. Android device runtime testing remains pending.

## Version 0.1.4: per-game cover removal

Remove cover clears custom artwork and saves a per-game placeholder preference. Restore default cover re-enables automatic artwork, and choosing a new image re-enables its custom cover. This preference survives reloads, new gameplay screenshots, and backup restoration. ROMs, battery saves, and checkpoints stay intact. All 22 unit/filesystem tests, TypeScript/production build, and isolated cover-action browser checks pass, including mobile controls. Android device runtime testing remains pending.

## Version 0.1.3: artwork gradient

The original library card spacing, favorites placement, and cover hover are restored. Dark shading is confined to the artwork; no surrounding card panel, border, or padding is added. The production build and desktop/mobile UI checks pass. The packaged Windows app was opened and visually verified with the existing five-game library. Android versionCode 4 builds successfully; device runtime testing remains pending.

## Version 0.1.1: artwork, dropdowns, and keyboard focus

- Production TypeScript/Vite build and all 17 storage/library tests pass.
- All five homebrew covers load locally, with creator credits and license texts included offline. User-selected artwork keeps priority.
- UI regression checks pass for sorting, screen filter, default/player speed, rewind selection, typeahead, arrows/Enter/Escape, search focus, both themes, mobile layout, and fullscreen popup placement.
- Real mGBA keyboard checks reproduce and fix the speed-selector focus trap, and verify pause/blur release, volume control, checkpoint text entry, remapping, and visible bindings.
- Full app import/play/save/resume/backup checks and packaged Windows app:// native storage/window-close/relaunch checks pass in isolated profiles.
- Android 0.1.1 (versionCode 2) builds successfully and its APK signature verifies. Device runtime testing remains pending.
## Version 0.1.0: first playable release

Version 0.1.0 was checked on Windows with the pinned mGBA core and an original homebrew diagnostic, not commercial ROM downloads.

- TypeScript and the Vite production build pass.
- 12 library/native-adapter unit tests pass: malformed ROM rejection, ZIP import, deduplication, concurrent metadata updates, battery/checkpoint separation, rotation, backup integrity and conflict rejection, imported-save resume behavior, preference normalization, and Android interrupted-write recovery.
- 5 native filesystem tests pass, including traversal/Windows-path rejection, complete atomic writes, binary round trips, and a real junction escape attempt.
- The real mGBA test passes framebuffer rendering, GBA input, SRAM import/export, reset, save-state capture/restore, 2× speed, rewind, screenshot generation, and cleanup.
- The browser UI test passes first import through game play, theme persistence, immediate theme contrast, favorites, search, grid/list, auto-resume after reload, checkpoint restore, backup ZIP download, mobile pointer input, and responsive layout. No uncaught browser errors were observed.
- The packaged Windows `app.asar` passes the `app://` asset loader, native file bridge, real game input, checkpoints, OS-window-close auto-save, SRAM persistence, and auto-resume after relaunch. These checks use an isolated test profile.
- Android compiles and packages with JDK 21 and SDK 36. Its native plugins, launcher/splash resources, and final bundled web/WASM assets are checked. A physical-device/emulator runtime test is still pending.

`release/BUILD-INFO.json` records the final artifacts and asset comparisons; `release/SHA256SUMS.txt` records their file hashes. The Windows build has no commercial code-signing certificate. The Android artifact is debug-signed rather than a Play Store production release.

Selected advanced features that remain unimplemented are listed in [ROADMAP.md](ROADMAP.md).

## Version 0.3.1: editable mobile controls

43 unit tests and 11 filesystem tests pass. The dedicated Playwright touch suite drives the real mGBA diagnostic using CDP touch input: simultaneous A + D-pad, sliding up to right, independent finger release and cancellation. Editor checks cover pausing/resuming, drag, 180% scale, opacity, cancelling/resetting, independent portrait/landscape layouts, rotation bounds, reload persistence, a 320px sliding menu and checkpoint dialog access. Evidence: `.cache/test-results/mobile-controls-report.json` and mobile-controls/editor/drawer screenshots. Native package build and verification status is recorded separately in release/BUILD-INFO.json.

The 0.3.1 compact APK was installed in an isolated API 36 x86_64 Android emulator. Native file import, upper-right drawer, touch dragging, changing A from 100% to 160%, resuming play, the relocated Save function and its success toast all passed. The moved/resized A control changed the real framebuffer from green to red while held and back to green on release. The emulator host exited before cold-relaunch verification; this update does not claim native Android restart/restore verification. Browser reload persistence, independent orientations and packaged Windows cold relaunch passed. No physical Android phone was available.

A final stable React key was added to each D-pad child after the Android smoke test. Both packages were rebuilt and the full browser touch suite (including console errors) and packaged Windows save/profile checks were repeated. The native Android evidence records the pre-key-fix APK hash separately from the final package hash; native Android runtime was not repeated after that rendering-only change.

## Version 0.4.0: mobile play features

The browser suite drives the real mGBA core with one-finger diagonals, neutral release and turbo A pulses. It verifies left-handed presets, per-game isolation and reload persistence, top-positioned 80% display, restore preview/cancel/recovery and full-backup reminders/export. Unit tests also cover preset bounds, malformed input, turbo masks, inheritance and per-game mobile backup restoration. Native Android system-bar/haptic bridge compilation is checked during the compact APK build. Native Android runtime and physical-device vibration are not claimed by browser tests; see the release build report for current runtime status.

## Version 0.4.1: collapsed saves

The save-history browser check verifies all groups start collapsed, click and keyboard expansion still work, other games remain collapsed, and reloading restores the collapsed default. Game grouping, restoring, isolated deletion, light/dark appearance and the 320px mobile layout passed. The mobile flow and packaged Windows save/resume checks also passed.

## Version 0.4.2: UI motion

The motion suite checks cover staggering, fixed dropdown geometry in opening dialogs, save-group height expansion, rapid reversal and cleanup, keyboard activation, collapsed page-entry defaults, app and OS reduced-motion preferences, and the 320px phone layout. The save-history and mobile gameplay regression suites remain release gates. Native Android device runtime is not inferred from browser tests.
