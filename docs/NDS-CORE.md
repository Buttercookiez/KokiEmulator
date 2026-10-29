# Koki NDS engine source

Koki NDS 0.1.1 builds SkyEmu's DS core from pinned, publicly available source. The former binary-only Pilas port is not included in this release.

- Core: https://github.com/skylersaleh/SkyEmu/tree/f4d3238bf42da483ed1b7cc35649398b2110e4b4 (MIT).
- Bridge: engines/nds-core/koki-nds.c (MIT).
- BIOS replacement: Gilead Kutnick's open replacement, included upstream under BSD-2-Clause. No Nintendo BIOS is bundled.
- ROM save-type database: separately licensed MIT by the melonDS team; notice preserved in licenses/nds/ROM-database-MIT.txt.
- Compiler/runtime: Emscripten 4.0.23, SDK revision aaa43392544d695232b70eda706d751f18980c2a. Compiler, libc and runtime notices are bundled in licenses/nds/Runtime-notices.txt.

engines/nds-source-manifest.json records each upstream input, byte length and SHA-256. engines/nds-manifest.json records the produced files and bridge hash. The release's source ZIP contains all those core inputs, the bridge, notices and build script.

## Rebuild

Install Node 22.12+ and Emscripten SDK 4.0.23 from https://github.com/emscripten-core/emsdk. Activate that version and load its environment. Set EMSDK to that SDK's absolute path and EMSDK_PYTHON if its Python is not already selected.

Run from the repository or extracted source-bundle root:

~~~sh
node scripts/build-nds-core.mjs
~~~

The script verifies/downloads the exact upstream inputs and builds engines/nds/koki-nds-core.js and engines/nds/koki-nds-core.wasm. It verifies the rebuilt hashes against the release manifest. For a deliberate source update, use --update-manifest, rerun playback/checkpoint tests and publish matching source and binaries together.

To use the source bundle's included files without fetching them, set KOKI_NDS_SOURCE_DIR to the absolute path of its upstream/skyemu directory. No CMake, Qt, SDL, network bridge, camera or microphone is included in this DS-only integration. Installed apps load the core locally and need no runtime download.

The original BIOS replacement assembly and Makefile are included alongside its generated headers. The embedded headers are verified inputs to the DS core build, and their BSD license allows binary redistribution with the bundled notices.

## Checkpoint boundary

The engine uses its own versioned KOKINDS1 checkpoint container, game identity and checksum. Stored checkpoints add a bounded compressed envelope; rewind uses the raw container in memory. Restore repairs the core's pointers against the current instance and clears external log handles. Earlier Pilas checkpoints are not passed to this engine.

The first upgrade preserves the previous library index and battery saves under the private library's nds/migrations/pre-0.1.1 folder. Earlier checkpoints remain in history as recovery entries and are excluded from new-engine automatic rotation. Standard compatible .sav data is carried forward; a size mismatch fails without replacing the original save. Export a full library backup in the old app before upgrading if progress depends on an older checkpoint.
