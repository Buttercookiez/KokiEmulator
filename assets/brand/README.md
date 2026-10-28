# Koki brand assets

The original Split K symbol uses a vertical stem and two separated diagonal arms. The gaps keep the mark readable at small sizes and echo the discrete steps of pixel graphics.

- `koki-symbol.svg`: dark symbol on a transparent background.
- `koki-symbol-white.svg`: white symbol on a transparent background.
- `koki-wordmark.svg`: symbol and custom outlined lettering; no font installation required.
- `koki-wordmark-white.svg`: inverse wordmark for dark surfaces.
- `koki-app-icon.svg`: white symbol in a dark rounded square.

Matching transparent PNG exports are included. The symbols and app icon are 512 × 512 pixels; the wordmarks are 960 × 256 pixels. `koki-logo-preview.png` shows both appearances.

Use the symbol at 24 px or larger. Keep clear space around it equal to the stem width. Invert the mark for dark surfaces; do not stretch it or close the gaps.

The interface uses neutral black, white, and gray. Primary buttons invert between light and dark appearances. Artwork may keep its original color or use the optional monochrome treatment.

The Android launcher uses `../android/koki-gba-launcher.svg`, which adds a small outlined GBA label. Regenerate its legacy, adaptive, and themed resources with `node scripts/generate-android-icons.cjs`. The shared brand and Windows icon stay unchanged; `--include-windows` also regenerates the Windows ICO.
