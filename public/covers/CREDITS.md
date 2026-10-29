# Bundled game artwork

The four PNG files in this folder are unmodified 240 × 160 screenshots captured from the free homebrew releases listed below, using the bundled mGBA core. They identify the user's imported games; they are not Nintendo box art, and no commercial games or ROMs are bundled with the app. Each game's art and trademarks remain the property of its respective creators.

| Screenshot | Creators | Original release and source | License / attribution |
| --- | --- | --- | --- |
| `aunt-floras-mansion.png` | anna anthropy (original game); velipso (GBA port) | [Aunt Flora's Mansion](https://github.com/velipso/auntflora) | [Zero-Clause BSD](./licenses/Aunt-Flora-0BSD.txt); GBA port made with the original author's permission |
| `minicraft.png` | Markus Persson (original Minicraft); Vulcalien (GBA demake) | [Minicraft GBA](https://github.com/Vulcalien/minicraft-gba), version 2.0 | [GPL-3.0-or-later](./licenses/Minicraft-GPL-3.0.txt) |
| `skyland.png` | Evan Bowman | [Skyland](https://github.com/evanbowman/skyland-beta), release 2026.9.30.0 | [MPL-2.0](./licenses/Skyland-MPL-2.0.txt) |
| `tigermoth.png` | pmprog | [Tigermoth](https://pmprog.itch.io/tigermoth), June 17, 2021 GBA Jam release; [source](https://github.com/pmprog/TigermothGBA) | [MIT](./licenses/Tigermoth-MIT.txt) |

No images were edited. The interface scales and crops them for display. The game's own title or gameplay scene appears beneath the library's consistent title overlay. Source ROM SHA-256 hashes and upstream download details are recorded in `sources.json` alongside these images, and in `games/homebrew/sources.json` in the local project. License texts are included in the adjacent `licenses/` directory for offline use. `scripts/capture-game-covers.mjs` reproduces the captures when those local ROMs are present; it performs no downloads.

Custom cover artwork chosen by the user overrides these bundled images. For other games, the most recent gameplay screenshot is shown when available, followed by the existing Koki fallback. No online artwork service is used.



The uCity Advance default screenshot is no longer bundled. Imported uCity games can use a user-selected cover or their latest local gameplay screenshot. Its original game files are not changed.
