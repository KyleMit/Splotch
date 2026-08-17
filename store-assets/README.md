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
├── captures/                 # Committed app-capture intermediates, one per target × scene —
│                             # what /dev/store-frames composes into the frames
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
Captures are driven in capture mode (`web/src/lib/storeCapture.ts`), which drops the wand button's
free-generation count so no per-install number lands in a marketing shot. The design system —
geometry, copy, marks, colors — lives in the app as the `/dev/store-frames` dev harness
(`web/src/routes/dev/store-frames/lib/`), where every composition renders live and hot-reloads for
design iteration.

## What each screenshot shows

| #  | File             | Story                                                                                                                                                                       |
| -- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 | `01-draw.png`    | Hero: a child's drawing mid-session (island on phones, party-hat dinosaur on tablets), full UI with enlarged action buttons, logo + chips (Ages 2+ · offline · open source) |
| 02 | `02-books.png`   | The Coloring Books picker showing all 8 real cover thumbs — two tall columns on the tall iPhone slot, the native 3/3/2 grid on the 16:9 Play phone                          |
| 03 | `03-magic.png`   | A Farm cat page ~85% revealed by natural child scribbles in magic mode, magic brush active in the toolbar                                                                   |
| 04 | `04-ai.png`      | Doodle → AI masterpiece showcase: a real drawing, the real generation it produced, the wand-stars icon                                                                      |
| 05 | `05-parents.png` | Dark mode: Settings open on the Tool Drawer section — advanced controls on, one tool hidden, the button-size slider live                                                    |

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
with `vite preview` (a server already on 4173 is reused only after its `/dev/store-frames/identity`
route proves it serves this checkout; pass `--port` for an unused port otherwise). It then drives
the app in headless Chromium at each target's capture size, writes each app capture to `captures/`
(committed), and screenshots the live `/dev/store-frames/render` route at the exact store pixel
sizes — the frames and the Play feature graphic are real Svelte components, not composed rasters.

Frame-only iteration (copy, layout, marks — nothing the app renders):

```bash
npm run gen:store-assets:frames
```

re-renders every final from the committed captures without driving the app, and the
`/dev/store-frames` harness shows the same compositions hot-reloading under `npm run dev`.

Iterate on a subset with `--target` / `--page` substring filters, e.g.
`npm run gen:store-assets -- --target tablet10 --page 03`.

One capture knowingly diverges from what the capture viewport would natively show, in order to
*match* what real hardware shows: portrait captures run at 576 CSS px (for the ~1.6× marketing
scale), where the books grid renders three columns — but every real phone is narrower than the app's
520px two-column breakpoint (an iPhone 6.9" is 430 CSS pt, a typical Play phone ~411), so shipping
devices render **two** columns. The tall iPhone capture injects a capture-only override re-stating
the app's own tall-portrait two-column rule (unreachable at 576px because of its 741px width gate)
to restore that real-device column count;
`tools/marketing-assets/tests/books-grid-override.test.mjs` fails if the override ever drifts from
the component's rule. The 16:9 Play phone slot lacks the height for four cover rows and keeps the
capture-native 3/3/2 grid.

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
* **Screenshot claims must match the build.** Page 1's chips (Ages 2+, offline, open source) are
  marketing claims, and page 5's Tool Drawer capture seeds a parent mid-curation (advanced controls
  on, the Stroke width tool hidden, button size raised to match page 1's enlarged buttons).
* **Description must match the privacy declarations.** The full description mentions the optional AI
  upload; make sure that lines up with the Play Data safety form and the App Store privacy nutrition
  label (see the `mobile` skill).
* **Feature graphic** (Play-only) has no embedded text-as-the-only-content issues, but review it
  against the current brand before publishing.
