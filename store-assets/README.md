# Splotch — store assets (Google Play + Apple App Store)

Generated assets for both store listings. Copy for the text fields:

* Google Play → [`STORE-LISTING.md`](./STORE-LISTING.md)
* Apple App Store → [`APP-STORE-LISTING.md`](./APP-STORE-LISTING.md)

## Contents

```
store-assets/
├── STORE-LISTING.md          # Google Play: app name / short + full description
├── APP-STORE-LISTING.md      # App Store: name / subtitle / keywords / privacy label
├── icon-512.png              # Play app icon  512×512   (Play limit: ≤1 MB)
├── feature-graphic.png       # Play feature graphic 1024×500 (Play limit: ≤15 MB)
└── screenshots/
    ├── phone/     01–05  1080×1920 (9:16 portrait)    Google Play phone
    ├── tablet7/   01–05  1920×1080 (16:9 landscape)   Google Play 7" tablet
    ├── tablet10/  01–05  1920×1080 (16:9 landscape)   Google Play 10" tablet
    ├── iphone69/  01–05  1290×2796 (portrait)         App Store iPhone 6.9"
    └── ipad13/    01–05  2732×2048 (landscape)        App Store iPad 13"
```

Every Play screenshot is ≥1080 px on each side, so the phone set is **promotion
eligible** and the 10" set meets the higher 1080 px minimum. The App Store sets
use the exact sizes App Store Connect accepts for the required 6.9" iPhone and
13" iPad slots (smaller devices scale down automatically). The App Store icon is
not in this folder — Apple takes the 1024×1024 `AppIcon` from the app binary's
asset catalog.

## What each screenshot shows

| # | File | Scene |
|---|------|-------|
| 01 | `01-draw.png`          | Free drawing — a rainbow, sun, grass and flower, with the color palette and tools visible |
| 02 | `02-coloring-book.png` | The built-in coloring books (Animals pages) |
| 03 | `03-color-page.png`    | Coloring a page inside the lines |
| 04 | `04-color-picker.png`  | The rainbow color picker (hundreds of colors) |
| 05 | `05-parent-center.png` | The Parent Center — toggle tools, "no ads, no tracking, no accounts" |

## Portrait vs. landscape

Both stores accept a single orientation per device type. Splotch is fully
responsive, so the assets use the most natural fit:

- **Phones → portrait.** This is the standard for phone listings and how most
  users hold a phone.
- **Tablets → landscape.** Shows off the wide canvas; tablets are commonly used
  in landscape.

The 7" and 10" Play tablet images are intentionally identical (same 1920×1080
capture) — Play allows reusing them, and it satisfies both size specs.

## Regenerating

Screenshots are captured from the **real running app** (not mockups), so they
always match what ships. From the repo root:

```bash
npm run gen:shots
```

The script (`scripts/store-shots.mjs`) starts a dev server on port 4173 (or
reuses one already there), drives the app in headless Chromium at the exact
target pixel sizes per store, draws on the canvas, opens each dialog, and also
renders the Play feature graphic from an inline HTML template using
`icon-512.png`.

`icon-512.png` is `assets/icon.png` (the 1024² source) resized to 512².

## Notes / things to double-check before you submit

- **Third-party IP kept out.** The app's coloring books include Bluey and Frozen
  pages, which are trademarked. The screenshots deliberately use only the generic
  **Animals** book to avoid a metadata/IP rejection. Consider whether those
  branded packs should ship in the public store builds at all.
- **App icon transparency.** `icon-512.png` is a 24-bit PNG on a solid (white)
  background — accepted by Play, which applies its own shape mask. iOS icons
  must not have alpha; `@capacitor/assets` flattens them when generating the
  asset catalog. If you prefer a colored backdrop behind the "S", regenerate the
  source and re-run.
- **Description must match the privacy declarations.** The full description
  mentions the optional AI upload; make sure that lines up with the Play Data
  safety form and the App Store privacy nutrition label (see the `mobile`
  skill).
- **Feature graphic** (Play-only) has no embedded text-as-the-only-content
  issues, but review it against the current brand before publishing.
