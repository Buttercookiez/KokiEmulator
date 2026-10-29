# Third-party notices

Koki bundles license and copyright texts for its listed frontend, emulator and Android runtime components. Open **About Koki → Open-source licenses** to read them entirely offline. The complete texts are compiled into the app once, without a separate runtime download or redundant public copies.

`scripts/sync-assets.mjs` reproducibly collects the exact installed LICENSE files for React, React DOM, Scheduler, Lucide React, idb, fflate, Inter/Fontsource, and Capacitor Core, Android, App, Filesystem and Share. The generated, tracked UI inventory is `src/legal/third-party.json`; it records installed package versions, complete license texts, source references and content hashes. Missing package licenses fail the synchronization step.

The unmodified mGBA artifacts are copied from pinned `@wasm-gaming/mgba-wasm` 0.1.1 under MPL-2.0. Its full license and [core integration/source notice](docs/EMULATOR-CORE.md) are bundled beside the core and included in the offline license reader.

Identified Android runtime notices cover AndroidX, Kotlin/coroutines, Apache Cordova Android and Ionic's native filesystem library. Exact official license/NOTICE files and their source URLs and SHA-256 hashes are retained in `licenses/native/`. This inventory describes those components; it does not replace notices accompanying the platform WebView or the separately distributed Electron runtime. Build tools and test-only dependencies are not represented as shipped app components.

No commercial games or Nintendo BIOS images are included. Four homebrew game screenshots are bundled, with their creators, sources and full license texts in the offline reader and [artwork credits](public/covers/CREDITS.md). The noncommercial uCity Advance screenshot is no longer included. User-provided game files and artwork remain the user's own content.

## NDS preview

Koki NDS 0.1.1 uses SkyEmu DS, built from pinned MIT-licensed source. The open BIOS replacement is BSD-2-Clause; the ROM save database carries its own MIT notice from the melonDS team. Compiler/runtime notices are also included in licenses/nds/. The Koki bridge is MIT-licensed. See [NDS source and build notes](docs/NDS-CORE.md) and the offline license reader. The earlier binary-only port is not bundled in this release.

## NDS 0.2.0 native Android

Koki NDS is distributed under GPL-3.0-or-later; see LICENSE-NDS.txt. Android uses the pinned melonDS-android-lib core at 431ab4bd0003c4356e25fce89640ae1004579b9b, with JIT and threaded software rendering. FreeBIOS and generated firmware are used. Full corresponding source, bridge, build scripts and dependency manifests accompany the release. See docs/NDS-NATIVE.md. Native core GPL, teakra MIT and FatFs notices are retained in licenses/nds-native/ and in the offline license reader. SkyEmu compatibility and Windows components retain the licenses listed above.
