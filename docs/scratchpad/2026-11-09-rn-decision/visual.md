# Visual lane: does RN look as good as shipping, screen by screen?

2026-11-09/10, Claude (visual lane). RN = `427756f14`, shipping = `ef3d1eb20`. Raw shots, masked
pairs, `mask.tsv`, `results.tsv` and scripts live in the rig scratch folder under `campaign/shots/`
and `campaign/visual/`.

## Method

* **Web captures (this lane).** RN's existing `dist/web` served by its own
  `tools/page-load/serve-export.mjs`. Shipping: the **real web build**, not the app bundle — the web
  lane's separate `ship-wt` worktree at `ef3d1eb20`, built 21:58 with `@sveltejs/adapter-netlify`
  (its build log says so; the output carries `_headers`, `sw.js`, `site.webmanifest`, `beta.html`),
  served by the web lane's `serve-shipping.mjs` behind RN's same edge proxy — web.md's "Serving
  (matched)". The shipping checkout's own `web/build` (`200.html`, no `_headers`) is the Capacitor
  bundle and was not used. Fresh ports, no rebuilds. Playwright 1.63 Chromium, headless, Android
  Chrome UA, touch, `prefers-color-scheme` light/dark with Theme = System; identical scripted
  strokes; one fresh context per screen group; under the rig lock. 27 screens × 2 themes × 2 arms at
  phone portrait 390×844 @2×, tablet landscape 1366×1024 @1× and tablet portrait 1024×1366 @1×, with
  0 capture failures. Phone landscape: not done (the harness's palette selectors miss in landscape
  in both arms, 4 of 27 screens each; not fixed, breadth first). No `/api` locally, so the AI button
  stays "AI image unavailable" in both arms; the web AI entry beyond that is not done.
* **Native captures** came from the journeys lanes. Galaxy: physical, 61 pairs, portrait plus a
  light landscape set and 200 % font. iPad simulator: 12.9", iOS 26.5, 59 pairs. Physical iPad: 1
  pair, because WDA cannot drive it.
* **Masked review.** One fresh Sonnet reviewer per pair, given only arm-free copies `A.png`/`B.png`,
  a one-line screen/device description and the rubric; A/B random per pair. **40 reviewers spent:
  iPad 16 (15 sim + 1 physical), Galaxy 16, web 8.** Pairs were chosen by decision value and a
  pixel-difference score, so near-identical pairs did not spend reviewers.

## Results (unmasked)

| Platform   | Screen                   | Theme | Orient. | Preference | RN defects                                                                               | Shipping defects                                                                      |
| ---------- | ------------------------ | ----- | ------- | ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ipad       | canvas-empty             | night | land    | RN         | minor: one colour short (no Indigo)                                                      | **major: custom-colour button clipped off bottom edge**                               |
| ipad-sim   | canvas-empty             | light | land    | RN         | cosmetic: home indicator shown                                                           | minor: custom-colour button clipped                                                   |
| ipad-sim   | brush-menu               | light | land    | RN         | cosmetic: rounded ink corners                                                            | **major: rail overflows, custom-colour button half visible**                          |
| ipad-sim   | brush-menu               | night | land    | RN         | cosmetic only                                                                            | minor: custom-colour button cropped                                                   |
| ipad-sim   | coloring-page            | light | land    | RN         | cosmetic: no selected-tool outline                                                       | **major: custom-colour button cut off**                                               |
| ipad-sim   | coloring-page            | night | land    | RN         | cosmetic only                                                                            | minor: custom-colour button clipped                                                   |
| ipad-sim   | coloring-page-grid       | night | land    | RN         | minor: AI badge clipped                                                                  | **major: custom-colour button clipped**; minor: status-bar text dim                   |
| ipad-sim   | coloring-book-picker     | light | land    | RN         | cosmetic only                                                                            | minor: thumbnails flatter; minor: custom-colour button clipped                        |
| ipad-sim   | coloring-book-picker     | night | land    | RN         | minor: white thumbnails glare at night                                                   | **major: status-bar text near-invisible**; **major: custom-colour button clipped**    |
| ipad-sim   | settings-appearance      | night | land    | tie        | cosmetic                                                                                 | minor: custom-colour button clipped                                                   |
| ipad-sim   | parental-gate            | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| ipad-sim   | photos-permission-prompt | light | port    | RN         | cosmetic: rounded ink                                                                    | minor: sharp mitred zigzag looks harsher                                              |
| ipad-sim   | save-failure-banner      | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| ipad-sim   | ai-style-prompt          | light | port    | shipping   | minor: Sticker thumbnail lacks white outline                                             | minor: focus ring on close                                                            |
| ipad-sim   | clear-confirm            | light | port    | RN         | cosmetic                                                                                 | minor: clear fade looks glitchy where strokes overlap                                 |
| ipad-sim   | canvas-ink               | light | port    | shipping   | minor: "ragged marker edges" (not visible in my unmasked crops — low confidence)         | none                                                                                  |
| galaxy     | canvas-empty             | light | port    | RN\*       | none                                                                                     | minor: undo looks active on empty canvas (\*state: shipping can undo the prior clear) |
| galaxy     | canvas-ink               | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | canvas-ink               | night | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | tray-open                | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | brush-menu               | light | port    | shipping   | minor: AI badge clipped                                                                  | cosmetic                                                                              |
| galaxy     | color-picker             | light | port    | shipping   | **major: status-bar icons dark on black, unreadable**                                    | none                                                                                  |
| galaxy     | coloring-page            | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | clear-confirm-drag       | light | port    | shipping   | minor: ink and line art nearly invisible mid-drag                                        | minor: ink pale mid-drag                                                              |
| galaxy     | parent-gate              | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | settings-hub             | night | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |
| galaxy     | settings-appearance      | light | port    | shipping   | **major: status bar black-on-black**; minor: Orientation picker stacked vertically       | minor: Orientation labels cramped                                                     |
| galaxy     | settings-appearance      | night | port    | shipping   | **major: Orientation picker stacked vertically, oversized**                              | minor: Orientation labels cramped                                                     |
| galaxy     | settings-saving          | light | port    | shipping†  | major (reviewer): "Save drawings to / Choose folder" row absent; minor: status bar black | cosmetic                                                                              |
| galaxy     | settings-feedback        | light | port    | shipping   | minor: "Something's broken" wraps in its segment                                         | cosmetic: textarea grip                                                               |
| galaxy     | coloring-book-picker     | light | port    | shipping   | minor: status-bar icons dark on black                                                    | cosmetic                                                                              |
| galaxy     | font200-settings-hub     | light | port    | RN         | minor: Appearance row stacks its icon; minor: subtitles truncated                        | **major: Appearance subtitle clipped to "Night Mode ·…"**; minor: subtitles truncated |
| web-tablet | settings-about           | night | land    | RN         | minor: heavy scrim hides background                                                      | minor: release-notes line clipped mid-glyph; minor: install banner touches dialog     |
| web-tablet | coloring-page-grid       | light | land    | tie        | cosmetic                                                                                 | minor: hard white band in scroll fade                                                 |
| web-phone  | settings-hub             | light | port    | RN         | minor: scroll fade on last row                                                           | minor: last row cut with no scroll cue                                                |
| web-phone  | settings-about           | light | port    | shipping   | minor: blurred backdrop muddy                                                            | minor: install card overlaps dialog                                                   |
| web-phone  | settings-appearance      | night | port    | RN         | cosmetic: blur loses context                                                             | minor: install banner sits above scrim; minor: low-contrast "How?"                    |
| web-phone  | settings-install         | light | port    | shipping   | major (reviewer): blurred backdrop looks smeared                                         | minor: install banner behind dialog                                                   |
| web-phone  | color-picker             | night | port    | shipping   | major (reviewer): blurred backdrop; minor: square focus ring on a hexagon                | minor: trash clipped; cosmetic: no selected indicator                                 |
| web-phone  | coloring-page-grid       | light | port    | tie        | cosmetic                                                                                 | cosmetic                                                                              |

† Pixels favour shipping, but the Android journeys lane found shipping's "Choose folder" does
nothing on Android native (a dead control), while RN hides it on native by design
(`SaveFolderSetting` renders it only on web). Net: shipping has a minor defect (a dead control) and
RN has none.

### Roll-up

| Platform              | Reviewed | RN wins | Ties | Shipping wins | Not reviewed (budget)                                                                                                                                |
| --------------------- | -------- | ------- | ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPad (sim + physical) | 16       | 11      | 3    | 2             | 44                                                                                                                                                   |
| Galaxy                | 16       | 2\*     | 6    | 8†            | 45                                                                                                                                                   |
| Web (tablet + phone)  | 8        | 3       | 2    | 3             | 154, of which 33 are pixel-identical (mean abs diff < 0.1/255: every tablet canvas, drawer and menu screen in both orientations, phone empty canvas) |

**Read the iPad number with care:** 8 of the 11 RN wins rest on **one shipping defect**. On the
12.9" iPad in landscape, shipping's 13-swatch palette pushes the custom-colour button half off the
bottom edge; this shows on the simulator and the physical device, and the iPad lane also saw it 8 pt
off-screen on a 13" simulator. RN drops Indigo (12 swatches) and fits. Without that defect, the
reviewed iPad screens are at parity. **Galaxy, read the same way:** 5 of 8 shipping wins rest on two
RN defects, light-theme status-bar contrast (×4) and the Orientation stack (×2, one pair counted in
both).

### Defects by root cause (reviewer severity → my severity for the decision)

| Defect                                                                                                                                                                                                                                                    | Arm      | Where                                         | Severity                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- | ------------------------------------------ |
| **New ink invisible after a rotation** until a menu forces a repaint (paper half unpainted). Journeys-ipad: 4 of 9 rotate→clear→draw cycles, 0 of 6 without rotation, shipping 0 of 8; this lane's landscape `canvas-ink` captures show it in both themes | RN       | iPad sim                                      | **major** (a child draws and sees nothing) |
| Custom-colour button half off-screen in landscape                                                                                                                                                                                                         | shipping | iPad 12.9"/13" landscape, every canvas screen | major (a kid control is half unreachable)  |
| Status-bar icons dark on a near-black bar while a dialog is open, light theme (verified by crop)                                                                                                                                                          | RN       | Galaxy                                        | minor (parent screens only)                |
| Status-bar text near-invisible in night dialogs (iPad sim); dark-on-olive on Galaxy night dialogs (crop)                                                                                                                                                  | shipping | iPad sim, Galaxy                              | minor                                      |
| Orientation picker wraps into a tall vertical stack                                                                                                                                                                                                       | RN       | Galaxy settings                               | minor                                      |
| Text clipped at 200 % font ("Night Mode ·…"); journeys-android also saw "Accessibili" clipped                                                                                                                                                             | shipping | Galaxy                                        | minor                                      |
| "Choose folder" shown but dead on Android native                                                                                                                                                                                                          | shipping | Galaxy                                        | minor                                      |
| Backdrop blur behind web dialogs read as "smeared" (2 reviewers major, 1 preferred it)                                                                                                                                                                    | RN       | web phone                                     | split; cosmetic to me                      |

## Other findings

* **Ink geometry (iPad):** for the same fast zigzag, RN rounds corners into waves and shipping keeps
  sharp mitred corners. Reviewers were neutral or preferred RN's look. Fidelity under a real finger
  is an owner question.
* **Night coloring-book thumbnails:** RN shows white line-art tiles; shipping inverts them to dark
  tiles. One reviewer called RN's tiles harsh at night (minor); the iPad lane rates it cosmetic.
* **Galaxy landscape canvas-ink (unreviewed, unmasked look):** shipping's shot carries an extra
  diagonal stroke from the lines to the clear button; RN's does not. The cause is unknown and may be
  the harness.
* **Web parity is near-total:** RN's web export reproduces shipping's chrome pixel for pixel on
  every canvas, drawer and menu screen. It differs only in dialog backdrops (RN blurs, shipping
  dims), the install banner's stacking (shipping's sits above the scrim), and phone Settings type
  weight.
* **One-arm screens:** none on Galaxy or web. On the iPad sim, `parental-gate` night exists only for
  shipping (a capture gap). On the physical iPad, `canvas-ink` night exists only for RN. No feature
  screen is missing from either arm.
* **Never arrived:** nearly the whole physical-iPad set (WDA blocked). From the iPad sim:
  `tray-open` and `settings-hub`; night and landscape variants of the colour picker, stroke width,
  clear, parent gate and AI screens; and landscape Settings sections other than Appearance. From the
  Galaxy: night landscape. No gallery exists in either arm.
