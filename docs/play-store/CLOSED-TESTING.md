# Closed-testing handoff

Use a protected production-upload-key-signed AAB from release/play-store/. Do not upload the existing debug-signed preview APK as a Play release. Keep the signing key and its recovery backup private; neither belongs in the listing kit or GitHub.

## Before enrolling testers

1. Finish the app setup tasks in Play Console using STORE-LISTING.md, DATA-SAFETY.md and APP-CONTENT.md. Confirm that https://koki-emulator.vercel.app/privacy/ is publicly accessible. Keep missing owner-only declarations pending until actually completed.
2. Upload the signed AAB to internal testing first, review automated/pre-launch findings, and fix failures. Internal-test enrollment does not replace the required closed test.
3. Create the closed testing track, add the real tester email list or Google group, copy the opt-in URL and install from Google Play.
4. Preview users must export a full backup before uninstalling the debug APK. A Play signing identity cannot ordinarily update a debug-signed installation with the same package. After installing the Play build, restore the backup and confirm progress before deleting the exported copy.

## Tester instructions — copy-ready

Install Koki from the closed-test opt-in link using the Google account you enrolled. Bring a GBA game you are authorized to use; the app includes no games. Keep the original game file and export a backup before testing recovery or reinstalling.

Please try importing and launching a game, playing for at least 15–30 minutes, sound, simultaneous D-pad/action buttons, control resizing/moving, portrait and landscape, per-game settings, named checkpoints, in-game saves, returning to the library, backgrounding the app, relaunching after closing it, and exporting/restoring a backup. Check light/dark colors, reduced motion and readability on your phone.

Report device model, Android version, Koki version, steps to reproduce, expected/actual result and a screenshot if useful to johnfrancismarabe040905@gmail.com. Do not send commercial ROMs or your entire library. A screenshot or description is usually enough. Remain opted in throughout the required testing period and provide real usage feedback.

## Test record

Keep an actual record of device/Android version, test date, game/file provenance, import, sustained play, sound, multi-touch, rotation, save/resume, checkpoint restore, background/force-stop recovery, and backup export/restore. Record failures and retest after fixes. Emulator automation is useful, but does not certify performance or touch/audio behavior on physical phones.

For personal developer accounts created after November 13, 2023, Google currently requires at least 12 closed-test users opted in continuously for 14 days before applying for production access. Real engagement and a clear account of fixes matter; elapsed time alone is not an approval guarantee. Source: [Google's testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Production approval, final account verification, IARC answers and closed-test completion are Console/external states; a locally prepared kit cannot certify them.
