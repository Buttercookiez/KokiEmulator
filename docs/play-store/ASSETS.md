# Store graphics and screenshot provenance

The 512 x 512 RGBA app icon is an export of the original Split K/GBA launcher artwork with a full square background. Google Play applies the corner mask and shadow. The 1024 x 500 RGB feature graphic uses the original outlined Koki logo and locally bundled Inter. Neither graphic includes ranking claims, store badges, third-party consoles or game artwork.

Run node scripts/export-play-store-kit.mjs to reproduce PNG graphics and create the upload listing folder under release/play-store/listing/. The icon is 32-bit RGBA; the feature graphic is 24-bit RGB with no alpha. The script verifies dimensions, formats, text lengths and SHA-256 checksums.

The screenshots must be captured from the actual current app; the export script never fabricates them. Put them in release/play-store/screenshots/ using the filenames in screenshots.json, then run node scripts/export-play-store-kit.mjs --require-screenshots. Prefer 1080 x 1920 portrait or 1920 x 1080 landscape. Each must be RGB PNG with no alpha, dimension range 320–3840, aspect ratio no greater than 2:1. No device frames, fake gameplay or promotional overlay is added by this kit. The validation manifest records the actual files, hashes and dimensions. Alt text is in screenshots.json; edit it if the final captured screen differs.

Capture only games/visuals with suitable rights. The original Koki diagnostic ROM has no third-party game assets. Aunt Flora's Mansion's GBA port is 0BSD with credits in public/covers/CREDITS.md; preserve attribution in any accompanying provenance. Avoid commercial ROM art and uCity Advance artwork, whose art license is CC BY-NC-SA 4.0. That artwork is excluded from these original store graphics and should not be introduced into store captures.

Requirements and screenshot guidance: [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en). Icon rules: [Google Play icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications). These sources distinguish listing graphics from Android launcher resources.

The PNG exports and SVG sources in assets/play-store/ are original Koki brand artwork created for this project; existing project ownership remains unchanged. Inter is covered by its bundled SIL Open Font License. Screenshots remain records of actual app behavior and retain any depicted homebrew creators' rights.
