# Splotch — store assets (Google Play + Apple App Store)

Generated assets for both store listings. Copy for the text fields:

* Google Play → [`STORE-LISTING-ANDROID.md`](./STORE-LISTING-ANDROID.md)
* Apple App Store → [`STORE-LISTING-IOS.md`](./STORE-LISTING-IOS.md)

## Contents

```
store-assets/
├── STORE-LISTING-ANDROID.md  # Google Play: app name / short + full description
├── STORE-LISTING-IOS.md      # App Store: name / subtitle / keywords / privacy label
├── icon-512.png              # Play app icon  512×512   (Play limit: ≤1 MB)
├── feature-graphic.png       # Play feature graphic 1024×500 (Play limit: ≤15 MB)
└── screenshots/
    ├── phone/     01–05  1080×1920 (9:16 portrait)    Google Play phone
    ├── tablet7/   01–05  1920×1080 (16:9 landscape)   Google Play 7" tablet
    ├── tablet10/  01–05  1920×1080 (16:9 landscape)   Google Play 10" tablet
    ├── iphone69/  01–05  1290×2796 (portrait)         App Store iPhone 6.9"
    └── ipad13/    01–05  2732×2048 (landscape)        App Store iPad 13"
```

Every Play screenshot is ≥1080 px on each side, so the phone set is **promotion eligible** and the
10" set meets the higher 1080 px minimum. The App Store sets use the exact sizes App Store Connect
accepts for the required 6.9" iPhone and 13" iPad slots (smaller devices scale down automatically).
The App Store icon is not in this folder — Apple takes the 1024×1024 `AppIcon` from the app binary's
asset catalog.

## The screenshot design

Each screenshot is a **captioned marketing frame** (2026-08 design refresh): a real app capture in a
rounded card over a soft gradient, with a headline + subtext copy block, hand-drawn crayon doodle
marks in the whitespace, and (page 1 only) the logo row and benefit chips. Landscape puts the copy
in a left column with the app frame bleeding off the right edge; portrait stacks the copy block on
top with the frame below, fully visible. Page 4 is a composed doodle→masterpiece showcase; page 5 is
the one dark-mode frame. The design system — geometry, copy, marks, colors — lives in
`tools/marketing-assets/lib/store-frames.mjs`.

## What each screenshot shows

| #  | File             | Story                                                                                                                                                       |
| -- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 | `01-draw.png`    | Hero: a child's drawing mid-session (island on phones, party-hat dinosaur on tablets), full UI, logo + chips (Ages 2+ · Works offline · Free & open source) |
| 02 | `02-books.png`   | The Coloring Books picker showing all 8 real cover thumbs                                                                                                   |
| 03 | `03-magic.png`   | A Farm cat page ~85% revealed by magic-brush swipes, magic brush active in the toolbar                                                                      |
| 04 | `04-ai.png`      | Doodle → AI masterpiece showcase: a real drawing, the real generation it produced, the wand-stars icon                                                      |
| 05 | `05-parents.png` | Dark mode: Settings open on Parent Center's grown-up-check policy matrix                                                                                    |

The AI showcase uses a real input/output pair from the model bake-off
(`scrapbook/model-eval/prompt-adherence/assets/`), so the "AI-generated picture" shown is an actual
generation, not an illustration.

## Portrait vs. landscape

Both stores accept a single orientation per device type:

* **Phones → portrait.** This is the standard for phone listings and how most users hold a phone.
* **Tablets → landscape.** Shows off the wide canvas; tablets are commonly used in landscape.

The 7" and 10" Play tablet images are intentionally identical — Play allows reusing them, and it
satisfies both size specs (the generator copies tablet10 → tablet7).

## Regenerating

Screenshots are captured from the **real running app** (not mockups), so they always match what
ships. From the repo root:

```bash
npm run gen:store-assets
```

The script (`tools/marketing-assets/gen-store-assets.mjs`) needs a **production build** on port 4173
— the coloring-pack manifest behind the 8-book grid only exists in a build, and the capture driver
waits on the dev-harness seam — so it builds with `PUBLIC_ENABLE_DEV_HARNESS=true` and serves it
with `vite preview` (a server already on 4173 is reused as-is). It then drives the app in headless
Chromium at each target's capture size, composes every capture into its frame at the exact store
pixel sizes, and renders the Play feature graphic from `icon-512.png`.

Iterate on a subset with `--target` / `--page` substring filters, e.g.
`node --experimental-strip-types tools/marketing-assets/gen-store-assets.mjs --target tablet10 --page 03`.

`icon-512.png` is `assets/icon.png` (the 1024² source) resized to 512².

## Notes / things to double-check before you submit

* **Third-party IP kept out.** Every shipped coloring book is original work — no trademarked
  characters or franchises, in the packs themselves or in any doc that reaches the bundle. Keep it
  that way: a branded pack is an IP-rejection risk on both stores, and worse in a
  children's-audience app. Note that anything under `web/static/` is copied into the web build and
  both native bundles, so a planning doc parked there ships too.
* **App icon transparency.** `icon-512.png` is a 24-bit PNG on a solid (white) background — accepted
  by Play, which applies its own shape mask. iOS icons must not have alpha; `@capacitor/assets`
  flattens them when generating the asset catalog. If you prefer a colored backdrop behind the "S",
  regenerate the source and re-run.
* **Screenshot claims must match the build.** Page 1's chips (Ages 2+, offline, open source) and
  page 5's armed guardrail radios are marketing claims — page 5 seeds the policy states a store
  build ships with, since the web build defaults every check to off.
* **Description must match the privacy declarations.** The full description mentions the optional AI
  upload; make sure that lines up with the Play Data safety form and the App Store privacy nutrition
  label (see the `mobile` skill).
* **Feature graphic** (Play-only) has no embedded text-as-the-only-content issues, but review it
  against the current brand before publishing.
