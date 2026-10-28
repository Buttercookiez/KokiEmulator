# Koki's Emulator

A playable, offline Game Boy Advance emulator for Windows and Android, built around mGBA. The interface uses the original Split K identity, locally bundled Inter typography, neutral colors, and light, dark, and system appearances.

Version 0.4.3 adds an assembling K startup splash on Windows and Android, with saved colors and reduced-motion support. It includes control presets, eight-direction thumb gestures, per-game touch/screen profiles, adjustable picture placement, turbo A/B, optional touch haptics, checkpoint restore previews and backup reminders. Android gameplay requests immersive system bars.

## Use the app

Open the Windows portable executable in `release/`, or install the Android debug APK from the same folder. Choose **Add games** and import your own `.gba`, `.bin`, or `.zip` files. Games are copied into the app's local library; original files stay where they are.

There is no required account, server, analytics, CDN, or runtime download. No commercial games or Nintendo BIOS are included. The bundled core provides BIOS emulation.

## Working features

- Optional per-game speed, filter and key-mapping profiles, included in local backups.
- Real GBA emulation, audio, standard gamepads, compact-keyboard movement, keyboard remapping, and multi-touch controls.
- Collapsible sidebar with a remembered size, a sticky top bar, fewer labels, and improved Resume hover contrast.
- Fullscreen gameplay with floating controls revealed by mouse movement, touch, or keyboard navigation; desktop overlays hide after two idle seconds; mobile touch controls and the game-menu button stay available.
- Searchable library, favorites, grid/list views, sorting, custom local covers, cover removal/default restoration, and renamed titles.
- Offline screenshot artwork for the five homebrew sample games, with credits; other games use their latest screenshot.
- Consistent light/dark dropdowns with keyboard and touch selection, plus a clean search focus state.
- Save history grouped into collapsible game sections, with checkpoint counts and newest saves first.
- Ordinary `.sav` import/export, automatic resume, screenshot checkpoints, named checkpoints, and recovery before restoring or restarting.
- Configurable speed, slow motion, hold-to-fast-forward, rewind, pause, screenshots, volume, fullscreen, and display filters.
- Local backup ZIP export/restore, integrity validation, ROM deduplication, and automatic checkpoint rotation.
- 16 color palettes, a custom color picker and hex input, independent saved light/dark choices, and automatic system appearance.
- Original SVG/PNG/ICO branding and native Android launcher/splash assets.

Choose the palette icon in the top bar to open the dedicated **Colors** page. Select Light or Dark to customize that mode; each remembers its own choice. System mode follows the device and uses the corresponding saved palette.

Choose a game cover to open **Game details**, then turn on **Play profile**. Changes apply only to that game; turn it off to use the current global settings. The player speed control also updates the active game profile when one is enabled.

## Smaller packages

The Windows download is about 102.83 MB (previously 113.76 MB); the extracted app is about 325 MB (previously 418 MB). Its application archive is about 1.65 MB, down from 43.76 MB. The optimized, debug-signed Android APK is 1.39 MB, down from 5.50 MB. Sizes use decimal MB. Windows retains its offline Electron runtime and GPU fallbacks.

Frontend packages are development/build dependencies because Vite bundles them. Production apps omit duplicate node_modules, source maps, and unused font subsets. Windows keeps the English runtime locale. Android defaults to the code/resource-shrunk compact variant, signed with the same debug key as earlier APKs. Use --debug with the build script for an ordinary debug build; --release remains unsigned until production signing is configured. Local ROMs, battery saves and checkpoints are unchanged.

## Develop

Requirements: Node 22.12+ and npm. Android builds additionally need Android SDK 36 and JDK 21; the build script detects the standard Android Studio installation. Windows packaging is configured for x64.

```sh
npm ci
npm run dev
```

The local preview runs at `http://127.0.0.1:5173`. For the Windows app in development, stop that preview and run:

```sh
npm run desktop:dev
```

```sh
npm run build
npm run desktop:build
npm run android:build
```

`desktop:build` creates a portable Windows executable in `release/`. `android:build` builds a debug-signed APK, copies it into `release/`, and retains the Android Studio project in `android/`. A production Android release needs a separately configured signing key.

## Controls

| GBA control | Default key |
| --- | --- |
| Direction pad | WASD or arrow keys |
| A / B | X / Z, or J / K |
| L / R | Q / E |
| Start / Select | Enter / Right Shift |
| Pause | Space |
| Quick checkpoint / load checkpoint | F5 / F8 |
| Hold fast-forward | Left Shift |
| Hold rewind | Backquote |
| Leave fullscreen | Escape |
| Save and return to library | Back button; Escape when already windowed |

The game opens fullscreen where supported. Move the mouse, touch the screen, or press Tab to reveal controls. Controls stay visible while paused, in a menu, or while a touch button is held. The picture keeps its original proportions, so some screen shapes leave black space at the sides. The game screen receives keyboard focus on launch and after choosing speed; click the game screen to focus it again. Custom key mappings take priority over the WASD, arrow, and J/K aliases. Unchanged legacy defaults migrate to the compact layout; custom mappings are preserved.

## Where your data lives

- **Windows:** the app's user-data directory, inside `library/`. Use **Settings → Open data folder** to see it.
- **Android:** private app storage using Capacitor Filesystem. Exports use the Android share sheet so you can save a copy elsewhere. Uninstalling the app removes private data; export a backup before uninstalling.
- **Browser preview:** IndexedDB for the current browser profile and origin. Browser data clearing also clears that preview library. Use the packaged apps for native file storage.

The Windows executable is portable; its user data remains in the Windows app-data folder. Game files, battery saves, and emulator snapshots are separate. Importing a `.sav` file moves older automatic snapshots into recovery history so auto-resume cannot replace the imported progress.

Local backups are ZIP files with a versioned manifest and SHA-256 ROM identities. Import merges games and checkpoints, replaces included battery saves with a recovery copy, and restores preferences. The first version supports backups up to 512 MB and individual ROMs up to 32 MB. Snapshot formats are specific to the pinned mGBA core; My Boy! snapshots are not imported as `.sav` files.

## Verification

```sh
npm test
```

Browser/native integration scripts use Playwright and Microsoft Edge on Windows. With the dev server running (set KOKI_TEST_URL to its address when using a different port):

```sh
node scripts/test-emulator.mjs
node scripts/test-app.mjs
node scripts/test-keyboard.mjs
node scripts/test-immersive.mjs
node scripts/test-save-history.mjs
node scripts/test-profiles.mjs
node scripts/test-ui-controls.mjs
node scripts/test-covers.mjs
node scripts/test-themes.mjs
```

After a production build, `node scripts/test-native.mjs` checks the real Electron `app://` loader, native local storage, OS-window-close save handling, and resume after relaunch in an isolated test profile.

On Windows, the Android build script also handles JVM temporary-socket paths used by desktop sandbox environments. It scopes the workaround to `.cache/jvm` without changing global Java settings.

Android compiler output uses a project-specific system temporary cache to avoid OneDrive locks. The finished APK is copied back to `release/`. Set `KOKI_ANDROID_BUILD_ROOT` to choose a different build-cache directory.

`scripts/make-diagnostic-rom.mjs` generates an original tiny ARM/GBA homebrew diagnostic for these tests: green display, red while A is held, directional colors, and SRAM writes. Test games and profiles remain in ignored `.cache/`; they are not shipped in the app.

## Project layout

`src/` holds the React UI, player, local library, and emulator adapter. `electron/` holds the isolated Windows shell and filesystem bridge. `android/` is the native Android project. `assets/brand/` contains editable logo sources. `scripts/sync-core.mjs` copies the pinned WASM files for fully offline builds.

The application is private and unlicensed. Bundled open-source components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md) and [core documentation](docs/EMULATOR-CORE.md).

### Mobile touch layout

While playing, tap the upper-right menu and choose **Edit controls**. Drag the D-pad or any button; select a control to change its size (80–180%) and adjust opacity. Hide the editor panel when it covers a control. **Done** saves; the close button cancels. Portrait and landscape layouts are independent, saved on this device, and included in library backups. Reset affects only the current orientation. L/R start higher above the action buttons. The mobile menu replaces the top-left buttons and bottom playback bar; desktop playback bars remain available.

### Mobile play options

In **Game menu → Edit controls**, choose Classic GBA, Large buttons, Left-handed, or One hand. Save for **This game** to keep its layout, opacity, picture and turbo options separate; choose **All games** to update defaults and clear this game’s mobile overrides. Other games with custom profiles keep their overrides. Portrait and landscape control layouts remain separate. In **Screen & button options**, place the picture at the top, center or bottom, resize it from 60–100%, and enable optional vibration or turbo A/B (3–15 presses/second while held). Thumb gestures support diagonals, a neutral center and release outside the pad. Android hides system bars in gameplay; swiping from an edge temporarily reveals them. Settings shows the last backup export date. Checkpoint restore previews keep a recovery checkpoint before replacing the active state.

Version 0.4.1: Save history opens with all game groups collapsed. Click a game heading to show its checkpoints; leaving and re-entering the page starts collapsed again.

Version 0.4.2: Lightweight page fades, staggered cover entrances, menu/dialog fades, button feedback, smooth sidebar resizing and save-group expansion. Save groups still start collapsed. Native keyboard access and rapid toggles remain available. Both Settings → Reduced motion and the operating-system preference disable the new animations. No animation framework or remote assets were added; gameplay button response is unchanged.

## Showcase website

The collection website source is in `website/koki-showcase/`. It includes the emulator collection homepage, GBA downloads, responsive styling, original artwork, loading animation, smooth scrolling and magnetic controls.

Live website: https://koki-emulators.almondpin2.chatgpt.site/

Install its dependencies with `npm ci` from that directory. The website build reads the parent project’s `release/BUILD-INFO.json` and verified Windows/Android artifacts, so prepare those app releases before running its `npm run build`. Then run `npm run dev` to preview it.

Generated releases, build output, dependencies, local game ROMs and saves are excluded from Git. Homebrew provenance, artwork credits and third-party licenses remain with the source.

## Deploy the landing page to Vercel

Import this repository with the Root Directory set to the repository root (`.`). The tracked `vercel.json` selects the landing-page build, disables Vite app detection, and serves `website/koki-showcase/dist-vercel`. Leave the build/install/output values from the repository configuration.

```sh
npm ci --prefix website/koki-showcase --ignore-scripts
npm run build:landing
```

This build needs no Electron install or local `release/` files. Download buttons use the GitHub preview release described in `website/koki-showcase/releases/current.json`. The emulator’s existing `npm run build` remains the app build. Set `SITE_URL` for a custom canonical domain; otherwise Vercel’s production URL is used.
