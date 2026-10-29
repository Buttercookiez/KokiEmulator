# Verification for the 0.4.4 closed-test candidate

The signed upload bundle is `Koki-GBA-0.4.4-PlayStore.aab` (Android code 18). App source commit: `6057e89badf9fde148aaf5b7c69e301f46ebc0a8`. Its SHA-256 is `4862cb7a0f1db0f4f8006ece13e7e79a0fa1b6c89823bc0f421690b5ef0c4877`.

Passed: type checking; 49 unit and 11 filesystem tests; mobile controls and real-core mobile playback/profile/recovery/backup browser suites; offline privacy/migration/license dialogs and keyboard access at 320px and desktop width; official bundletool validation; production signatures and asset coherence; no debugging, bundled ROMs or private signing files; public Vercel privacy/support/reviewer-download checks.

The matching nondebuggable verification APK was tested on an isolated API36 Android emulator: real system file-picker import, WASM playback, A and all four directions, manual/automatic checkpoints, background/force-stop/relaunch resume, and backup export. An unprivileged temporary receiver read the granted export URI; exported ROM hash, SRAM test byte and checkpoint files were verified. Four screenshots were captured directly from this APK with only the licensed 0BSD Aunt Flora example imported. The game is not bundled in the app.

Limits: no physical Android phone or sound verification; native backup restoration, sustained play, hardware controllers, and real-device screen-reader behavior remain closed-test checks. The PC's headless emulator crashed twice; the hidden GUI emulator with host graphics completed the checks. Android WebView accessibility data sometimes became stale during automation, requiring cold restarts or visually checked taps. These results do not certify production readiness or Google approval.

Detailed signed build, package validation, native QA and screenshot records are in `release/play-store/BUILD-INFO.json`, `VALIDATION.json`, `NATIVE-QA.json` and `listing/ASSET-VALIDATION.json`. The existing 0.4.3 preview downloads were preserved. No Google Play account, track or tester enrollment has been created: the owner has not yet registered a Play Console account.
