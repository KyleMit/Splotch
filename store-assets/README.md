# Splotch — Google Play store assets

Generated assets for the Play Console **Main store listing**. Copy for the text
fields is in [`STORE-LISTING.md`](./STORE-LISTING.md).

## Contents

```
store-assets/
├── STORE-LISTING.md          # app name / short + full description / release notes
├── icon-512.png              # App icon        512×512   (Play limit: ≤1 MB)
├── feature-graphic.png       # Feature graphic 1024×500  (Play limit: ≤15 MB)
└── screenshots/
    ├── phone/    01–05  1080×1920 (9:16 portrait)   (Play limit: ≤8 MB each)
    ├── tablet7/  01–05  1920×1080 (16:9 landscape)
    └── tablet10/ 01–05  1920×1080 (16:9 landscape)
```

Every screenshot is ≥1080 px on each side, so the phone set is **promotion
eligible** and the 10" set meets the higher 1080 px minimum.

## What each screenshot shows

| # | File | Scene |
|---|------|-------|
| 01 | `01-draw.png`          | Free drawing — a rainbow, sun, grass and flower, with the color palette and tools visible |
| 02 | `02-coloring-book.png` | The built-in coloring books (Animals pages) |
| 03 | `03-color-page.png`    | Coloring a page inside the lines |
| 04 | `04-color-picker.png`  | The rainbow color picker (hundreds of colors) |
| 05 | `05-parent-center.png` | The Parent Center — toggle tools, "no ads, no tracking, no accounts" |

## Portrait vs. landscape

Google Play accepts **either** 16:9 or 9:16 for every device type — you do **not**
need both orientations. Splotch is fully responsive, so the assets use the most
natural fit:

- **Phone → portrait (9:16).** This is the standard for phone listings and how
  most users hold a phone.
- **Tablets → landscape (16:9).** Shows off the wide canvas; tablets are commonly
  used in landscape.

The 7" and 10" tablet images are intentionally identical (same 1920×1080 capture)
— Play allows reusing them, and it satisfies both size specs.

## Regenerating

Screenshots are captured from the **real running app** (not mockups), so they
always match what ships. From the repo root:

```bash
npx vite dev --port 4173        # in one terminal
node scripts/store-shots.mjs    # in another — writes everything into store-assets/
```

The script (`scripts/store-shots.mjs`) drives the app in headless Chromium at the
exact target pixel sizes, draws on the canvas, opens each dialog, and also renders
the feature graphic from an inline HTML template using `icon-512.png`.

`icon-512.png` is `assets/icon.png` (the 1024² source) resized to 512².

## Notes / things to double-check before you submit

- **Third-party IP kept out.** The app's coloring books include Bluey and Frozen
  pages, which are trademarked. The screenshots deliberately use only the generic
  **Animals** book to avoid a metadata/IP rejection. Consider whether those
  branded packs should ship in the public Play build at all.
- **App icon transparency.** `icon-512.png` is a 24-bit PNG on a solid (white)
  background — accepted by Play, which applies its own shape mask. If you prefer a
  colored backdrop behind the "S", regenerate the source and re-run.
- **Description must match Data safety.** The full description mentions the
  optional AI upload; make sure that lines up with the Data safety form (see
  MOBILE.md §1).
- **Feature graphic** has no embedded text-as-the-only-content issues, but review
  it against the current brand before publishing.
