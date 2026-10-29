# NDS gameplay performance: findings and native Android proposal

Status: owner approved the native Android backend and GPL-3.0-or-later NDS distribution on 2026-10-29. Native integration is in progress; see ../NDS-NATIVE.md.

## Results

The current SkyEmu WebAssembly core interprets DS CPU instructions. A presentation-skipping experiment reduced one existing 32 MB game's mean desktop frame-processing cost from 13.96 to 12.76 ms (8.6%). A fully skipped frame still took 11.19 ms. These results do not establish a fix for the reported Redmi Note 10 Pro / Zelda lag. See benchmark.json for exact timings and limits.

Generated 0.1.4 checkpoints loaded in the candidate. Candidate checkpoints also loaded back in the unmodified core. The state magic, engine ID and 15,698,160-byte raw state size were unchanged. The experimental patch is recorded here but is not applied to the active app. No user ROM or save was modified. No performance-fix APK has been published.

## Proposed native Android backend

Integrate native melonDS with ARM64 JIT and threaded rendering. Retain Koki's library, original logo, themes, controls, layouts and menus. Keep the Android package ID and existing preview signing key so updates install in place.

Retain the current WASM backend as a compatibility option for its old checkpoints. Give native checkpoints a separate engine ID. Copy and validate raw in-game .sav data before importing it to native storage; back up the index and saves before migration. Keep the existing Windows backend during this Android-specific work.

Initial pinned integration reference: rafaelvcaetano/melonDS-android at c42995caff0144f37ad9791dc9bc96d82e8a6f65, which references melonDS-android-lib at 431ab4bd0003c4356e25fce89640ae1004579b9b. Verify all source inputs, submodules, notices and outputs before distribution.

- Android source and performance documentation: https://github.com/rafaelvcaetano/melonDS-android
- Native core candidate: https://github.com/rafaelvcaetano/melonDS-android-lib/tree/431ab4bd0003c4356e25fce89640ae1004579b9b
- GPL-3.0 license: https://github.com/rafaelvcaetano/melonDS-android/blob/master/LICENSE

The Android port documents 64-bit JIT and threaded rendering as performance features. This is a stronger candidate than another small WASM presentation change, but is not a full-speed guarantee for Zelda on this phone.

## Owner approval

The owner explicitly approved this native Android backend and GPL-3.0-compatible distribution/source licensing for the combined NDS app. Existing in-game saves need validation; old checkpoints remain accessible through the compatibility engine. The separately distributed GBA app is outside this licensing change.

## Release gates

- Build ARM64 from pinned source; install over the existing NDS APK with the same identity/key.
- Run CPU work and audio natively; render directly without a per-frame base64 bridge.
- Verify controls, pen input, screen layouts, suspend/resume and audio.
- Validate copied saves and interrupted-migration recovery; retain originals.
- Verify old checkpoints still open through compatibility mode.
- Compare sustained emulation speed, rendered FPS, input latency and memory against 0.1.4 on a physical ARM64 phone, including Zelda when its game file is available for testing.
- Publish source, notices and checksums, then remove temporary compilers and emulator disks.

## Automatic approval review

Automatic approval review rejected the combined engine/worker rewrite as an expansive compatibility-breaking change beyond the lag request. A narrower presentation-only experiment was subsequently allowed after baseline reproduction and checkpoint checks. The owner subsequently explicitly approved the native engine and GPL-3.0 NDS distribution.
