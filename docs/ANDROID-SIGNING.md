# Android Play Store signing

The Play Store build is separate from the existing debug-signed preview download.
Version 0.4.4 uses Android version code 18, minimum API 24 and target API 36.

## Create the upload key once

Run PowerShell 7.4 or later from the project folder:

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action Init

The default public certificate name is John Francis Marabe. Use -DeveloperName
only when creating a different, deliberate developer identity. No organization
or country is invented.

The helper creates an RSA 4096-bit PKCS12 upload key, valid for 10,000 days, in:

    %LOCALAPPDATA%\Koki Emulator\Signing\

The keystore password is generated randomly. Its persisted copy is encrypted
using Windows current-user DPAPI. Directory permissions allow the current
Windows account and SYSTEM. The private keystore and encrypted secret remain
outside the project; neither is printed, committed or sent to GitHub.

Init refuses to overwrite existing signing material. Status prints only public
metadata:

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action Status

If initialization was interrupted after creating the keystore and DPAPI secret but
before writing public metadata, preserve those private files. Complete that exact
initialization without regenerating a key:

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action CompleteInit

This recovery action expects the confirmed CN John Francis Marabe and existing
koki-upload alias, verifies the public certificate, and refuses existing metadata
or a different certificate identity. It never overwrites the keystore or secret.

A Windows account reset or machine loss can make a DPAPI-protected secret
unrecoverable. Make an encrypted owner backup before relying on this key.

## Build the upload bundle

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action Build

After a successful, unchanged frontend build, add -SkipWeb to reuse it.
The helper loads the password into the build process environment temporarily
and restores prior environment values afterward.

The equivalent cross-platform build is:

    npm run android:build -- --play

It requires all four environment variables supplied by a secret manager:

- KOKI_UPLOAD_STORE_FILE: absolute path to the external PKCS12 keystore.
- KOKI_UPLOAD_STORE_PASSWORD: keystore password.
- KOKI_UPLOAD_KEY_ALIAS: signing alias; the Windows helper uses koki-upload.
- KOKI_UPLOAD_KEY_PASSWORD: private-key password.

Never place passwords in command-line arguments, tracked properties files,
README examples or logs. A Play build refuses missing credentials, a keystore
inside the project, a debug certificate, a non-RSA or sub-2048-bit key, and a certificate that expires before 2033-10-23 or within another year. The initializer uses a lifetime longer than the recommended 25 years.
The Gradle release build has debugging disabled and uses code/resource shrinking.
Ordinary compact builds retain the original debug signing for existing previews.

## Output files

A successful Play build creates these files under ignored release/play-store/:

- Koki-GBA-0.4.4-PlayStore.aab: upload this file to the Play Console test track.
- Koki-GBA-0.4.4-verification.apk: use only for local device checks.
- BUILD-INFO.json: version, public certificate fingerprint and verified hashes.
- SHA256SUMS.txt: SHA-256 hashes for both artifacts.
- upload-certificate.pem: public upload certificate, safe to share when needed.

The script verifies the AAB JAR signature, confirms the actual AAB signer matches
the upload certificate, and verifies the APK signer with Android SDK apksigner
before copying the deliverables. It leaves the existing 0.4.3 preview APK and
Windows downloads in place.

Each subsequent Play upload needs a higher versionCode in android/app/build.gradle.
Keep versionName and the root package.json version consistent.

## Back up and restore the key

Choose a destination outside the project, preferably on a separate trusted drive.
The command prompts for a backup password; do not put that password in the command:

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action ExportOwnerBackup -BackupPath "D:\Private Backups\Koki-upload.kokikey"

The portable owner-backup container uses AES-256-GCM authenticated encryption and
PBKDF2-SHA256 with 600,000 iterations and a random salt. It contains both the
private keystore and its password, encrypted under the separately chosen backup
password. Keep that password in a password manager, separate from the backup.

To restore onto a Windows account without existing Koki signing material:

    pwsh -NoProfile -File scripts/android-signing.ps1 -Action RestoreOwnerBackup -BackupPath "D:\Private Backups\Koki-upload.kokikey"

Restoration authenticates the backup, recreates current-user DPAPI protection and
checks the certificate fingerprint. It refuses to overwrite existing signing
material. Protect the backup like a private signing key.

## Google Play App Signing and preview migration

Use Google Play App Signing for the new Play app. This local key is the upload key:
Google verifies uploads with it and distributes APKs signed using the Play app
signing key. The two key roles are different. Keep control of the Play Console
account and retain the upload-key backup.

The currently distributed com.koki.emulator preview is signed with Android Debug.
It cannot normally update in place to an app signed with the production Play key.
Before switching, preview users must export a complete library backup, uninstall
the preview, install the Play version and restore the backup. Android uninstall
removes private app data.

The locally generated verification APK is also signed with the upload key rather
than Google's app signing key. Prefer an internal Play test install for testing the
final installation and update path; export a backup before switching signatures.

## Release checks

Signing verifies package authenticity; it does not certify gameplay quality.
Before production, test the current bundle through a Play test track on physical
Android devices: import, controls, sound, sustained play, background/force-stop
recovery, save export/import, full backup restoration, rotation and relaunch.

### Independent bundle validation on this Windows workstation

`npm run play:verify` also runs Google's official bundletool validation and compares the release AAB/APK assets against the built frontend. It checks package/version/SDK, disabled debugging, minimal permissions, native bridge retention, offline policy, scoped export provider, and no bundled game/private signing files. Expected R8 obfuscation metadata is retained for Play; frontend source maps are excluded.

The verifier accepts `KOKI_BUNDLETOOL` as an absolute path to the official bundletool-all JAR. The preparation used bundletool 1.18.3 from https://github.com/google/bundletool/releases/tag/1.18.3 and verified the published SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`. Downloaded tools are ignored under `.cache/play-tools/`; they are not shipped in the app. Validation results are written to `release/play-store/VALIDATION.json`.
