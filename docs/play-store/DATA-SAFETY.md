# Data safety worksheet

Scope: Koki Android 0.4.4, com.koki.emulator. Developer: John Francis Marabe. Contact: johnfrancismarabe040905@gmail.com. This worksheet describes the current offline build. It is not a pre-submitted Console declaration.

## Suggested answers for this build

| Console topic | Answer / explanation |
| --- | --- |
| Collects or shares required user data types | No, under Google's definitions and exclusions described below |
| Data collected | None transmitted by the app to the developer or a backend |
| Data shared | None automatically; exporting is an explicit user action using the Android share sheet |
| Third-party SDK data collection | No advertising, analytics, crash-upload, account or payment SDK is present in this build |
| Accounts | No account creation or sign-in |
| Account deletion link | Not applicable to this app, because it has no accounts |
| Privacy policy | https://koki-emulator.vercel.app/privacy/ |
| Independent security review / certification | Do not claim one |
| Encryption in transit | No app-operated data transmission; do not claim encryption for services the user chooses in the share sheet |

If the form hides follow-up questions after 'No data collected or shared', leave them hidden. Do not invent encryption or deletion-request claims to fill optional fields. Review the final Console wording before submitting.

## Data handled locally

ROMs, in-game saves, checkpoints, thumbnails/covers, play history, profiles and settings are processed on the device. Android storage is private Directory.Data. Backups are created in private cache and handed to Android's system share sheet only after the user requests export. Original imported files are not deleted by library removal. Uninstalling removes private app data; exported copies stay wherever the user saved or shared them. Android automatic backup is disabled in the app manifest.

Evidence: src/lib/storage.ts (read/write/remove and exportFile), src/lib/library.ts, src/lib/emulator.ts (local bundled core), android/app/src/main/AndroidManifest.xml and capacitor.config.ts.

## Why the declarations differ from file access

Google defines collection in terms of transmission off the device and excludes local-only processing. Its sharing guidance excludes an expected transfer initiated by the user. Koki's named 'Save or share your Koki export' sheet falls into that expected user-directed flow. Opening the public privacy page or sending a support email is separate from uploading the user's library; do not put ROMs or backups into a support request unless the owner specifically asks and has the necessary rights.

Primary guidance: [Google Play Data safety instructions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en). Revisit every answer if ads, telemetry, cloud sync, online artwork or other network features are added. The declaration must cover all active variants and their SDKs.
