# Koki showcase website

A standalone static website for Koki's Emulator, with GSAP 3.15.0 animations, responsive home and GBA product pages, original SVG artwork, future-emulator previews and current Windows/Android downloads.

## Local preview

Run npm install, npm run build, then npm run dev. The default local address is http://127.0.0.1:5190. The build reads ../../release/BUILD-INFO.json and verifies the source Windows and Android artifacts before preparing downloads. The emulator application itself is unchanged.

## Updating app downloads

Build and verify the emulator's next release first, then run this site's build. Version, sizes and SHA-256 values are generated from the verified release metadata. Windows is served as verified 16 MiB static parts and assembled into the original portable executable by the browser; this keeps individual assets inside the host's limit. Android is a direct APK download. Do not manually rename a future emulator as available.

The Sites project identity lives in .openai/hosting.json. New Sites are private by default. Preserve that audience unless the owner requests a change. Source credentials must never be written to this repository. The Site helpers handle authenticated source synchronization and deployment archives.

GSAP, Inter and emulator attribution are available on /credits/. Artwork is original illustrative artwork, not a commercial ROM screenshot. Reduced motion uses the operating-system preference.

## Minimal dark edition (1.5.0)

The interface uses a charcoal and white palette, compact emulator rows, concise product copy and a borderless feature overview. A short logo intro appears on every full page load and browser refresh and clears on keyboard/pointer input, with independent script and CSS timeouts. It is hidden without JavaScript or with reduced motion. The decorative dot field responds to desktop pointer movement, rests when idle, and remains static on coarse pointers or reduced motion. Downloads are unchanged.

The preview version label is plain text, and the old illustrated interface demo is replaced with concise feature descriptions. The unused Draggable browser script is removed.

The homepage introduces the full emulator collection and links to the system chooser. GBA-specific hardware art, release information and downloads live on /gba/. The original graphite handheld concept replaces the pixel-scene GBA hero preview. It uses a self-contained SVG and desktop pointer tilt, with no 3D runtime. Platform downloads use compact rows instead of tall cards, while preserving exact build bytes and verification.

A decorative graphite Split K sculpture fills the right side of the desktop collection hero. The self-contained SVG reuses the original brand geometry, with cursor-driven 3D tilt, parallax and a masked surface highlight. It is noninteractive, hidden from assistive technology, static with reduced motion and omitted on phones for a compact layout.

The collection monogram rests at 55% opacity and softly rises to 66% while responding to the mouse. Leaving the hero returns the mark and light to their neutral positions. Reduced motion keeps the material static and the highlight off.

Desktop fine-pointer wheel scrolling uses locally bundled Lenis 1.3.27 with ScrollTrigger synchronization. After wheel inertia stops, a section boundary within 42px gently settles to the shared 24px anchor offset. Keyboard/pointer input cancels pending inertia; anchors use the same driver. Touch and reduced-motion retain native scrolling. Small magnetic button offsets reset on leave, focus and click; modals pause page scrolling, and browser Back restores a synchronized position. Lenis attribution and MIT license are linked on /credits/.

Headings omit trailing periods. The loading screen assembles the three original Split K pieces on each document load, with independent fail-open timers and reduced-motion skipping. The GBA concept has aligned Select/Start controls, no L/R controls or external captions. iOS uses an Apple silhouette; return links use a consistent left arrow.
