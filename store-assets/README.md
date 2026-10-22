# Splotch — store assets (Google Play + Apple App Store)

Committed artwork for both store listings. The application captures preserve the former frontend;
frame rendering reuses those images. Review their fit to the React Native release before publishing.
Copy for the text fields:

* Google Play → [`STORE-LISTING-ANDROID.md`](./STORE-LISTING-ANDROID.md)
* Apple App Store → [`STORE-LISTING-IOS.md`](./STORE-LISTING-IOS.md)

## Contents

```
store-assets/
├── STORE-LISTING-ANDROID.md  # Google Play: app name / short + full description
├── STORE-LISTING-IOS.md      # App Store: name / subtitle / keywords / privacy label
├── icon-512.png              # Play app icon  512×512   (Play limit: ≤1 MB)
├── feature-graphic.png       # Play feature graphic 1024×500 (Play limit: ≤15 MB)
├── captures/                 # Committed app-capture intermediates, one per target × scene —
│                             # what the frame documents compose into the frames
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

Each screenshot is a **captioned marketing frame** (2026-08 design refresh, portrait reflowed to the
portrait v2 handoff): a real app capture in a rounded card over a soft gradient, with a headline +
subtext copy block, hand-drawn crayon doodle marks in the whitespace, and (page 1 only) the logo row
and benefit chips. Landscape puts the copy in a left column with the app frame fully inside the
slot; portrait centers the copy in a zone above the frame, fully visible below. Page 4 is a composed
doodle→masterpiece showcase read diagonally — doodle top-left, print bottom-right — joined by a
stepping-stone connector (palette dots in, growing sparkles out); page 5 is the one dark-mode frame.
The committed captures omit the install-specific generation count. Their capture automation retired
with SvelteKit. The design system — geometry, copy, marks, colors — is framework-free data in
`web/src/lib/storeFrames/`, laid out as one self-contained HTML document per composition by
`tools/marketing-assets/lib/store-frame-document.mjs`.

## What each screenshot shows

| #  | File             | Story                                                                                                                                                                       |
| -- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 | `01-draw.png`    | Hero: a child's drawing mid-session (island on phones, party-hat dinosaur on tablets), full UI with enlarged action buttons, logo + chips (Ages 2+ · offline · open source) |
| 02 | `02-books.png`   | The Coloring Books picker showing all 8 real cover thumbs — two tall columns on the tall iPhone slot, the native 3/3/2 grid on the 16:9 Play phone                          |
| 03 | `03-magic.png`   | A Farm cat page ~85% revealed by natural child scribbles in magic mode, magic brush active in the toolbar                                                                   |
| 04 | `04-ai.png`      | Doodle → AI masterpiece showcase: a real drawing, the real generation it produced, the wand-stars icon                                                                      |
| 05 | `05-parents.png` | Dark mode: Settings open on the Tool Drawer section — advanced controls on, one tool hidden                                                                                 |

The AI showcase uses a real input/output pair from the model bake-off
(`scrapbook/model-eval/prompt-adherence/assets/`), so the "AI-generated picture" shown is an actual
generation, not an illustration.

## Portrait vs. landscape

Both stores accept a single orientation per device type:

* **Phones → portrait.** This is the standard for phone listings and how most users hold a phone.
* **Tablets → landscape.** Shows off the wide canvas; tablets are commonly used in landscape.

The 7" and 10" Play tablet images are intentionally identical — Play allows reusing them, and it
satisfies both size specs (the generator copies tablet10 → tablet7).

## Rendering frames from committed captures

From the repository root:

```sh
npm run gen:store-assets
npm run gen:store-assets:frames
```

Both commands run `tools/marketing-assets/gen-store-assets.mjs`, which reads the selected PNGs under
`captures/` and renders each composition's HTML at its store target's dimensions. They need
installed dependencies and Playwright Chromium, with no application build or server. They do not
change the captures. A full run also copies tablet10 frames to tablet7 and renders the feature
graphic.

Narrow frame iteration with the `--target` and `--page` substring filters:

```sh
npm run gen:store-assets -- --target tablet10 --page 03
```

A missing selected capture fails before browser startup or output writes. Restore that committed
image or provide a reviewed replacement with the dimensions `frameGeometry` requires. The retained
command cannot recapture the current app; updating listing screenshots requires new release captures
before re-rendering the frames.

The original iPhone book-grid capture used a two-column override to reproduce the phone layout at
its enlarged capture viewport; the Play phone capture preserved three columns. This explains the
pixels in the committed set. The old override and live frontend checks retired with the capture
pipeline.

`icon-512.png` is `assets/icon.png` (the 1024² source) resized to 512².

## Notes / things to double-check before you submit

* **Third-party IP kept out.** Every shipped coloring book is original work — no trademarked
  characters or franchises, in the packs themselves or in any doc that reaches the bundle. Keep it
  that way: a branded pack is an IP-rejection risk on both stores, and worse in a
  children's-audience app. Note that anything under `web/static/` is copied into the web export, so
  a planning doc parked there ships too.
* **App icon transparency.** `icon-512.png` is a 24-bit PNG on a solid (white) background — accepted
  by Play, which applies its own shape mask. Verify the native app's icon asset catalog and release
  export separately. If you prefer a colored backdrop behind the "S", update the source and
  regenerate the native app's icon assets.
* **Screenshot claims must match the build.** Page 1's chips (Ages 2+, offline, open source) are
  marketing claims. The preserved page 5 capture shows a parent mid-curation (advanced controls on,
  Stroke width hidden, enlarged buttons); verify those controls against the release build.
* **Description must match the privacy declarations.** The full description mentions the optional AI
  upload; make sure that lines up with the Play Data safety form and the App Store privacy nutrition
  label (see the `mobile` skill).
* **Feature graphic** (Play-only) has no embedded text-as-the-only-content issues, but review it
  against the current brand before publishing.
