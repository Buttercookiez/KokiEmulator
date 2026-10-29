# Koki Play Store handoff

Prepared for 0.4.4 by the project workflow. Public developer: John Francis Marabe. Support: johnfrancismarabe040905@gmail.com. First release: free, no advertisements, no purchases.

## What is prepared

Upload release/play-store/Koki-GBA-0.4.4-PlayStore.aab to Google Play. Keep release/play-store/Koki-GBA-0.4.4-verification.apk for local installation and QA only; it is not the new-app Play upload file. Build metadata, hashes and validation results are alongside them. The listing upload folder is release/play-store/listing/: copy-ready text, original 512 x 512 store icon, 1024 x 500 feature graphic, four actual Android app screenshots, alt text and ASSET-VALIDATION.json. Signing keys/passwords must not be in that listing folder. The in-app privacy/support and public privacy page describe the current offline app.

## Your Google Play account is still required

You do not currently have a Play Console account. Create it at https://play.google.com/console/signup, choose the correct personal or organization account, and complete Google's identity, contact and device verification prompts. Supply identity information directly to Google. This kit cannot create or verify an account, accept your agreements, or enroll testers on your behalf.

After your account is ready:

1. Create Koki GBA Emulator, English (United States), free. Confirm com.koki.emulator is available before treating it as your permanent Play package.
2. Complete the store listing using STORE-LISTING.md and the exported PNGs/text. Support email is required. Use https://koki-emulator.vercel.app/privacy/ for the privacy URL.
3. Complete app access using APP-CONTENT.md and Data safety using DATA-SAFETY.md. Enter the owner-confirmed 13+ intended audience: 13–15, 16–17 and 18 and over; the app is not directed to under 13s. Complete the actual IARC and other declarations in Console; the kit does not preassign a content rating. Pick accurate countries/category and finish the account-specific dashboard tasks.
4. Upload the production-upload-key-signed .aab to an internal test release, configure Play App Signing, and review Console/pre-launch reports. The local release APK is for verification, not the new-app Play upload file. Do not upload an old debug preview APK or any signing backup.
5. Correct any Play/pre-launch findings, then start the closed test and distribute its real opt-in link. Use CLOSED-TESTING.md for the tester instructions and feedback record.
6. Once the applicable test requirement is met, apply for production access and answer Google's questions from real tester feedback. Do not claim physical-phone tests, opt-ins or approval that have not happened.

The public diagnostic file at https://koki-emulator.vercel.app/reviewer/koki-diagnostic.gba lets a reviewer test the core without commercial ROMs. APP-CONTENT.md explains its expected screen/input behavior. Normal users bring their own authorized game files; the Android package includes no games or Nintendo BIOS.

## Preview user migration

The existing debug APK and the Play build use different signing identities. Export a full backup from the preview app before uninstalling, install the Play version, restore and verify progress, then keep a separate backup. Uninstalling deletes Android private app data. This is required even when both builds use the same package name.

## Checks and status

Run node scripts/export-play-store-kit.mjs --require-screenshots after current native captures are placed in release/play-store/screenshots/. This validates text lengths, PNG formats/dimensions and hashes. Read the actual signed-build QA report for technical results. Listing files and emulator checks do not certify physical Android performance, Play acceptance, developer-account completion or closed-test completion.

Guides: [Play app setup](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en), [closed-testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
