# Device-parity execution plan

Refs #2978 and #2690. This plan turns the inventory in this folder into a small set of repeatable
protocols. It routes every one of the 1,541 original requirements to a protocol or to an explicit
classification. **A mapping is not a pass.** Every row stays `unverified` until its protocol has run
on the exact candidate head and the result record is linked in the row's `evidence` column. Zero
requirements and zero cells are verified today.

`protocol-mapping.csv` is the machine-readable half of this plan, with one row per requirement:

| Column            | Meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `requirementId`   | The stable ID from `requirements.csv` (T, P, B, L, E or X)                                       |
| `kind`, `surface` | Copied from `requirements.csv`                                                                   |
| `classification`  | `protocol`, `physical-only`, `automated-test`, `settled` or `out-of-scope`                       |
| `protocolIds`     | The protocols that observe it, the first one primary, separated by `;`                           |
| `targets`         | Target classes the row runs on, using the `targets.csv` names                                    |
| `arms`            | The comparison arms (below)                                                                      |
| `namedTests`      | Tests at the current head that the historical ledger named                                       |
| `basis`           | The rule or decision behind the row, including each settled or out-of-scope reason               |
| `status`          | `unverified`, `blocked`, `settled` or `out-of-scope`; later also `verified`, `failed` or `stale` |
| `evidence`        | Empty until a protocol result record exists                                                      |

On an `automated-test` row, `namedTests` is the check itself once AC-1 confirms it. On any other row
those tests only support the protocol; they never replace it.

`build-protocol-mapping.py` builds the CSV from `requirements.csv`, the tracked test files and the
per-requirement decisions it holds. Run it from the repository root with `python3 -I`; `--check`
exits 1 when the committed CSV differs from what it builds. Change a mapping in the script, not by
hand. Once a protocol records its first result in `status` or `evidence`, the CSV becomes the record
and the script is no longer rerun.

## Counts

Classification of the 1,541 requirements:

| Classification   | Rows | Meaning                                                                                                     |
| ---------------- | ---: | ----------------------------------------------------------------------------------------------------------- |
| `protocol`       | 1229 | Runs on fresh simulators, emulators or browsers; some rows add a physical subcase                           |
| `physical-only`  |  129 | Needs a property only physical hardware has (the owner's list below)                                        |
| `automated-test` |   29 | A named existing test is the two-sided check, pending AC-1 confirmation that its oracle reads shipping code |
| `settled`        |   18 | Governed by a settled owner decision; recorded as accepted, never as a defect                               |
| `out-of-scope`   |  136 | Hosted SvelteKit routes, server behavior, shipping harness seams, or internals RN replaces                  |

By kind:

| Kind              | Rows | protocol | physical-only | automated-test | settled | out-of-scope |
| ----------------- | ---: | -------: | ------------: | -------------: | ------: | -----------: |
| Acceptance (T, P) |   59 |       49 |             9 |              0 |       1 |            0 |
| Behavior (B)      |  355 |      313 |            35 |              0 |       5 |            2 |
| Logic (L)         |  275 |      203 |            14 |             29 |       4 |           25 |
| Shipping E2E (E)  |  787 |      611 |            65 |              0 |       2 |          109 |
| Differences (X)   |   65 |       53 |             6 |              0 |       6 |            0 |
| **Total**         | 1541 |     1229 |           129 |             29 |      18 |          136 |

Status: 1,370 `unverified` and 17 `blocked`. P10, B0352 and X24 need a physical iPhone ring/silent
switch, which the rig does not have. Fourteen more rows carry an iOS offline or Low Data Mode
subcase with no permitted target (see Targets); their Android and web subcases still run. 18 rows
are `settled` and 136 `out-of-scope`. **0 are `verified`.**

Requirements per protocol. "Mapped" counts every row that names the protocol; "primary" counts the
rows that list it first. 192 rows map to two protocols, and 6 rows to three or four.

| Protocol | Title                                                       | Mapped | Primary | Physical-only | Automated | Settled |
| -------- | ----------------------------------------------------------- | -----: | ------: | ------------: | --------: | ------: |
| DS-1     | Drawing-screen chrome visual matrix                         |    106 |      79 |             0 |         0 |       3 |
| DS-2     | Drawing-screen chrome interaction and motion                |    143 |     129 |             0 |         0 |       0 |
| DS-3     | Ink, brushes, Undo and Clear output                         |    107 |     102 |             0 |         0 |       2 |
| PHY-1    | Physical drawing sanity and input fidelity                  |     87 |      81 |            77 |         0 |       0 |
| OV-1     | Overlay visual matrix                                       |    112 |     101 |             0 |         0 |       0 |
| OV-2     | Settings, Parent Center and gate behavior                   |    179 |     166 |             0 |         0 |       0 |
| A11Y-1   | OS text size, Button Size and Reduce Motion                 |     51 |      46 |             0 |         0 |       0 |
| A11Y-2   | Accessibility tree: names, roles, states, targets, focus    |     45 |      38 |             0 |         0 |       0 |
| KEY-1    | Hardware-keyboard input                                     |     40 |      26 |             0 |         0 |       0 |
| PHY-6    | Assistive speech (VoiceOver, TalkBack)                      |      9 |       5 |             2 |         0 |       0 |
| SAVE-1   | Save Picture, polaroid, failure banner, Auto-Save on Delete |     44 |      38 |             0 |         0 |       0 |
| SAVE-2   | Older-Android storage                                       |      8 |       6 |             0 |         0 |       0 |
| PHY-3    | Photos permission round trip                                |      6 |       4 |             3 |         0 |       0 |
| COL-1    | Coloring library, downloads and network policy              |     64 |      55 |             0 |         0 |       0 |
| LIFE-1   | Restart, cold launch, Back, orientation and recovery        |     94 |      70 |             0 |         0 |       2 |
| PHY-4    | Background, resume, idle and system navigation              |     32 |      23 |            18 |         0 |       0 |
| AI-1     | AI flow through deterministic fixtures                      |    137 |     129 |             0 |         0 |       0 |
| AI-2     | Live generation and picture report (human session)          |     12 |       1 |             0 |         0 |       0 |
| PHY-2    | Audio and haptics                                           |     19 |      18 |            16 |         0 |       0 |
| PHY-5    | Performance, refresh and thermal                            |     17 |      17 |            14 |         0 |       0 |
| INFO-1   | Information pages                                           |    100 |     100 |             0 |         0 |       0 |
| WEB-1    | RN web platform behavior                                    |    153 |     131 |             0 |         0 |       0 |
| AC-1     | Two-sided automated contract confirmation                   |     34 |      29 |             0 |        29 |       0 |

Subcells. `acceptance-subcells.csv` keeps its 4,798 proposed cells unchanged, and a subcell takes
the protocols of its `requirement`. Of those cells, 3,330 fall on a target that their requirement's
protocols use. Another 1,209 name `physical-ipad` or `physical-galaxy` on a routine visual or
behavior row. The owner's targets policy moves those rows to simulators, so their physical cells are
superseded, not run. A further 132 cells name a browser, and 118 a simulator or emulator, outside
their row's protocol targets. The 8 cells of P10 stay with that blocked row, and one subcell belongs
to the settled P19 row. A protocol's own state list replaces the generic setup and expected fields
of the cells it covers.

## Targets and arms

Routine visual and layout coverage runs on fresh simulators and emulators. Physical devices are kept
for the physical-only properties below, plus one drawing-screen sanity check.

| Target                        | What it is                                                                | Used by                     |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| `iphone-notch`                | Fresh iPhone simulator with a sensor housing, iOS 26.5                    | Routine native protocols    |
| `ipad-mini`                   | Fresh iPad mini simulator, iPadOS 26.5                                    | Routine native, KEY-1, AI-2 |
| `ipad-13`                     | Fresh 13-inch iPad simulator, iPadOS 26.5                                 | Routine native, KEY-1       |
| `android-api34`               | Fresh API 34 phone emulator, gesture navigation, display cutout           | Routine native protocols    |
| `android-api36`               | Fresh API 36 phone emulator, where edge-to-edge is enforced               | Routine native, AI-2        |
| `android-api36-tablet`        | Fresh API 36 tablet emulator                                              | Routine native, KEY-1       |
| `android-api24`, `-26`, `-29` | Fresh API 24, 26 and 29 emulators                                         | SAVE-2 only                 |
| `rn-web-chromium`             | Playwright Chromium at phone and tablet viewports                         | Routine web arm, WEB-1      |
| `rn-web-firefox`, `-edge`     | Playwright Firefox, and the installed Edge                                | WEB-1 browser coverage      |
| `rn-web-safari`               | Actual macOS Safari through safaridriver; Playwright WebKit is not Safari | WEB-1 browser coverage      |
| `physical-ipad`               | The attached physical iPad                                                | PHY protocols               |
| `physical-galaxy`             | The attached physical Galaxy phone, bound to Display0                     | PHY protocols               |
| `physical-iphone`             | Not available; a ring/silent switch has no substitute                     | P10, B0352, X24 (blocked)   |
| `ios-network-conditions`      | Not available; iOS offline or Low Data Mode with no permitted control     | 14 rows (blocked)           |
| `ci-exact-head`               | The hosted CI run on the exact candidate head                             | AC-1                        |

Arms:

* `rn`: the RN candidate Release build at the head under test, bundle ID
  `art.splotch.migration.probe`.
* `ref160`: the reconstructed v1.6.0 reference; store binary source unknown. A Release build of
  source 6572ed535f243d06e3f7bcaa5986218cac006d86 under the suffixed bundle ID
  `art.splotch.app.baseline.release`.
* `rn-web`: the RN web export at the head under test (`npm run native:web:build`), served locally.
* `web-prod`: shipping web built locally from production source
  dd6b86a2343d400bb654bc664020c09768e6c7f5, the independently identified 1.6.2682.
* `contract`: AC-1 only. The named test at the exact head, whose oracle side must read shipping
  source.

Both native arms install side by side on the same fresh target, so they share its runtime, screen
and settings. Verify each artifact's bundle ID, signature and source binding before install. Never
install over, launch or drive a store-installed `art.splotch.app`.

The iOS 16.4 and Safari 16.4 floor targets stay blocked as `targets.csv` records; they are a target
qualification outside this mapping. #2927 settled the iOS 26.5 simulator's background-download
limitation, so background coloring publication is physical-only.

`ios-network-conditions` marks the iOS subcase of 14 network-dependent rows: the AI button while
offline, allowance retry on reconnect, Low Data Mode and cellular download rules (P12, X15, X51 and
the rows the CSV lists). iOS simulators share the host network, and changing host network settings
is outside this campaign's permissions. The network is not on the owner's physical-only list, so a
physical window is not assumed either. These rows stay `blocked` until the owner names a permitted
method; their Android emulator and RN-web subcases run meanwhile. Some RN-web rows run in Safari on
`physical-ipad` with the `rn-web` and `web-prod` arms, because the Pencil and Scribble behavior they
test exists only there.

Physical-only properties, from the owner's list: performance, refresh rate and thermal; input
density and coalescing; palm and multitouch, including pinch; edge gestures; held-contact rotation;
audio and haptics; Photos library permission and writes; background and resume. Speech output counts
as audio.

## Execution order

Families run in order of user impact. A family can start once its arms are admitted on its targets.

1. **Drawing screen**: DS-1, then DS-2 and DS-3; PHY-1 in the first physical window.
2. **Settings and overlays**: OV-1, OV-2, A11Y-1, A11Y-2 and KEY-1; PHY-6 in a physical window.
3. **Save and Clear**: SAVE-1, SAVE-2 and PHY-3.
4. **Coloring books**: COL-1.
5. **Lifecycle**: LIFE-1 and PHY-4.
6. **AI Art**: AI-1; AI-2 in the human session.
7. **Physical media and performance**: PHY-2; PHY-5 in the performance sprints.
8. **Pages and web**: INFO-1 and WEB-1.
9. **Automated contracts**: AC-1 on every candidate head that CI runs.

## Rules shared by every protocol

**Admission.** Before a batch, record each arm's source SHA, artifact digest (private), bundle ID,
OS runtime build and target class. Check the foreground app identity immediately before every input.
On Android, bind input and capture to Display0. Never force internal state to reach a fixture: use
public controls, or a named test fixture where the protocol says so.

**Fresh targets.** Create or erase each simulator (`xcrun simctl create` or `erase`), and cold-boot
each emulator with wiped data and no snapshot. Keep text size at its default, Reduce Motion off,
locale `en_US` and Android gesture navigation on, unless the protocol varies them. Freeze the status
bar with `xcrun simctl status_bar … override` (time 9:41, full battery and signal) on iOS and with
SystemUI demo mode on Android. The status bar then never changes, so nothing is masked. If an
override fails, only the clock and battery may be masked, and the mask is recorded privately. Home
indicators, insets and ink are never masked.

**Stroke driver.** Strokes are synthetic paths in paper-normalized coordinates, 0 to 1 across the
visible paper rectangle. Both arms receive identical point lists at an 8 ms sample cadence: W3C
pointer actions through WebDriverAgent on iOS, UiAutomator2 W3C actions on Android, and Playwright
touch on web. Before any protocol trusts drawing or Undo, a driver cardinality check runs once per
target and arm (#2921). Inject three separate fixture strokes, then count enabled Undo presses until
Undo disables; expect three. As the negative control, inject the same paths as one continuous
contact and expect one. If the two counts do not differ, the driver is not admitted.

**Settle rule.** After the last input, capture the full frame repeatedly, at least every 250 ms. A
state is settled after three consecutive byte-identical frames, all taken at least 1,000 ms after
the last input. No settle within 10 s records an `unsettled` failure, such as a looping animation, a
stuck spinner or a download badge. Motion protocols record video with per-frame timestamps instead.

**Comparison.** Each comparison pairs `rn` with `ref160` on the same target, or `rn-web` with
`web-prod` at the same viewport. The reference arm defines the expected state; this plan does not
pre-judge it.

* Control frames come from each arm's accessibility tree: WebDriverAgent source, a UiAutomator dump,
  or Playwright bounding boxes.
* A frame passes when every edge is within 2 points or dp of the reference. One physical-pixel
  rasterization fringe is allowed.
* These fail: a different control set or order, a different selection or text wrap, a clipped or
  untappable control, changed ink, or a solid token fill more than 2/255 off in any channel.
* Paper grain and crayon texture are judged from the original images, never by a pixel-diff score.
* An inspector reviews both originals and the diff heatmap for every pair and records pass, fail or
  accepted difference.

**Settled differences.** These are recorded as `accepted difference (<decision>)`, never as a defect
and never as a pass of the original requirement:

* Accepted cutover data loss: no import or migration of shipping storage. Rows P19, X1, B0263, L0262
  to L0264 and E0369.
* The bottom-inset landscape palette trim: X44, and the iPad-landscape part of B0073.
* The X46 theme retint of drawn Black ink: X46 and B0053.
* iOS blur and Android dim behind dialogs, seen in OV-1 backdrops.
* The static premixed Flat fade under the glass panes, seen in DS-1 Flat cells.
* The iOS top band coloured from launch: DS-1 S0, the LIFE-1 cold launch, and parts of X58 and
  B0339.
* Removal of restoration (X6, B0063), of stroke and point caps (X7, B0028), and of the Pictures
  gallery and Export PNG.
* Ungated AI on/off and key save, and the gated damaged-settings reset (X55, B0103, L0220, E0506).
* React Compiler stays deferred. The brushes are Pen, Crayon, Magic and Eraser.
* The #2924 large-resize disposition (part of X11 and L0012), and the #2927 iOS 26.5 simulator
  background-download limitation.

**Evidence and status.** Media, traces, accessibility dumps and artifact receipts stay private, with
byte-verified recovery. The public record of a batch holds source and artifact SHAs, target class,
axes, cell counts, outcomes and inspector, and no device identifiers.

A requirement becomes `verified` only when every protocol it maps to has run on all its targets and
arms at one candidate head. Every resulting cell must pass or be an accepted settled difference, and
the `evidence` column must link the public result record. A failure leaves the row `failed`, linked
to its defect issue. A retry needs a diagnosed cause, changed code or helper, or corrected setup,
and failed takes are kept. `source-ownership.csv` marks a verified row `stale` when a later head
changes a path it depends on. No batch exceeds 600 seconds.

## DS-1: Drawing-screen chrome visual matrix

DS-1 is the first protocol the campaign executes. It covers T1-1 to T1-6 and the 100 behavior,
logic, E2E and difference rows mapped to it: the toolbar, palette, Tool Drawer and brush menus.
Axes: Raised/Flat × light/dark × portrait/landscape × phone/tablet.

**Targets and viewports.** Phones: `iphone-notch`, `android-api34`, `android-api36`, and
`rn-web-chromium` at 390×844 CSS px, DPR 3, touch. Tablets: `ipad-mini`, `ipad-13`,
`android-api36-tablet`, and `rn-web-chromium` at 1024×1366 CSS px, DPR 2, touch. On web, rotation
swaps the viewport dimensions.

**Batch.** One batch is one target or viewport × arm × style × theme × orientation, so there are 128
batches. Each starts from a fresh install, so batches are independent, and each runs for about three
minutes.

**Fixture state at batch start.**

1. Install the arm fresh. On web, open a new browser context with empty storage.
2. Set the OS appearance to the batch theme: `xcrun simctl ui … appearance`,
   `adb shell cmd uimode night`, or Playwright `colorScheme`. The app's own theme stays at its
   default, System. The Night Mode switch is not used, because X33 records that its rule differs;
   OV-2 compares that rule separately.
3. Launch the arm, open "Settings", and choose the batch style under Appearance → Button style:
   "Raised" or "Flat". Where an Orientation picker is shown, choose Auto. Close Settings. Every
   other setting stays at its fresh-install default: Pen at the default size, Purple, drawer
   collapsed, Crayon, Magic and Eraser enabled, AI off, sound on.
4. Set the batch orientation through the driver: `XCUIDevice` orientation through WebDriverAgent on
   iOS, the emulator console `rotate` on Android, a viewport swap on web.
5. Terminate the app.

**Reaching each state on both arms.** Controls are found by their shipping accessible names: "Expand
controls" and "Collapse controls", "Brushes", "Pen", "Crayon", "Magic brush", "Eraser", "Stroke
width", "Size N", "Eraser size N", "Custom Color", "Colors", colour names such as "Purple" and
"Black", "Coloring books" and "Settings". Where an RN name differs (X59 records "More colors" and
"<colour> paint"), the batch manifest holds a per-arm alias. A name difference is an A11Y-2 finding,
not a DS-1 failure. No input uses fixed coordinates across arms.

| State  | File stem                    | Reached by                                                                                                        | Row        |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| S0     | `s00-cold-launch.mp4`        | Start recording, cold-launch the arm, stop at settle                                                              | T1-1, T1-2 |
| S1     | `s01-blank.png`              | The settled frame after S0                                                                                        | T1-1, T1-2 |
| S2     | `s02-drawer-open.png`        | Tap "Expand controls"                                                                                             | T1-3       |
| S3     | `s03-brush-menu.png`         | Tap "Brushes"                                                                                                     | T1-4       |
| S4.1–5 | `s04-pen-size-N.png`         | Pick "Pen". For N from 1 to 5: open "Stroke width", tap "Size N", reopen "Stroke width", capture with it open     | T1-4       |
| S5.1–5 | `s05-eraser-size-N.png`      | Pick "Eraser" from "Brushes", then repeat the loop with "Eraser size N". Pick "Pen" and restore its starting size | T1-4       |
| S6     | `s06-color-menu.png`         | Phone landscape only: tap "Colors", capture, tap "Colors" again                                                   | T1-4       |
| S7     | `s07-custom-picker.png`      | Tap "Custom Color", tap the fixture hexagon, tap "Custom Color" again; capture the reopened picker                | T1-5       |
| S8     | `s08-custom-bar-ring.png`    | Close the picker by tapping its scrim; capture the palette                                                        | T1-5       |
| S9     | `s09-recalled-custom.png`    | Tap "Purple", tap "Custom Color", close by the scrim; capture                                                     | T1-5       |
| S10    | `s10-eraser-ring-absent.png` | Pick "Eraser" from "Brushes"                                                                                      | T1-5       |
| S11    | `s11-pen-recalled-ring.png`  | Pick "Pen" from "Brushes"                                                                                         | T1-5       |
| S12    | `s12-farm-ink.png`           | Tap "Coloring books", tap the first Farm page, then draw F1 to F3                                                 | T1-6       |
| S13    | `s13-theme-switched.png`     | Switch the OS appearance to the other theme while the app is in the foreground                                    | T1-6       |

The fixture hexagon is the first picker cell whose accessible name is identical on both arms; the
manifest records it once per target. The S6 Color Button exists only in phone landscape (B0080).
Elsewhere S6 is a source-proven skip, confirmed by S1 showing the palette bar.

Phone landscape has no palette bar: its swatches and "Custom Color" live in the Color Menu, which
closes on a pick and on a second "Colors" tap. In phone-landscape batches:

* The menu is opened only when it is closed: read the "Colors" control's expanded state from the
  accessibility tree before tapping it. A blind second tap would close the menu.
* Before every swatch or "Custom Color" tap in S7 to S11, open the menu.
* S7 reopens the picker the same way: open the menu, then "Custom Color".
* S8 to S11 first capture the closed "Colors" button as an extra `-closed` still. They then open the
  menu and capture its ring state, which stands in for the absent bar, and close it again with
  "Colors". Every step therefore starts with the menu closed.

Fixture strokes, in paper-normalized coordinates at the default size:

* F1: Pen in "Black". A zigzag from (0.15, 0.30) to (0.85, 0.30) with six peaks of amplitude 0.05,
  in 60 samples.
* F2: Crayon in "Purple". A circle centred at (0.35, 0.60) with radius 0.12, in 72 samples.
* F3: "Magic brush". A diagonal from (0.55, 0.45) to (0.85, 0.80), in 40 samples.

S12 waits for the Farm page art to land before drawing, then applies the settle rule after F3.

**Settle.** The shared rule applies to every still. S0 is a recording from before launch to the
first settled frame. Its pass rule covers the first-frame colour, any theme flash, and the band.

**Naming.** Private files go under
`ds1/<head7>/<target>/<arm>/<style>-<theme>-<orientation>/<file stem>`, with a sidecar `.json` per
capture. The sidecar records the source SHA, artifact digest, OS runtime, axes, input timestamps,
settle frame count, and the arm's accessibility frame table. `<head7>` is copied from
`git rev-parse` output. Web uses `rn-web-chromium-phone` and `rn-web-chromium-tablet` as the target
segment.

**What is compared.** Every state pairs the two arms at the same target, style, theme and
orientation, and compares:

* the control frames of the palette and each swatch, each drawer tile, the open menu and each of its
  entries, the Settings, Clear, Undo and camera buttons, and the paper rectangle;
* selection state: the ringed swatch and its ring colour, the pressed brush, the selected size, and
  the dimmed tiles while a menu is open;
* visible text and icons, the notch or status-band colour, and the safe-area insets;
* in S12 and S13 only, the ink geometry, colour and Magic reveal where chrome overlaps them. Ink
  fidelity itself belongs to DS-3.

**Pass rule.** A cell passes when the shared comparison rule holds for every listed element. Three
settled differences are accepted here: the X44 palette trim on an iPad in landscape with a bottom
inset, the X46 retint of drawn Black ink in S13, and the static premixed Flat fade under the Flat
panes. A state missing on one arm, such as no menu, no ring or no Color Button, fails the cell. A
requirement row is verified only when all of its DS-1 cells, on every target, pass or are accepted.

**Configuration variants.** The core matrix keeps every tool enabled, so rows about other drawer
configurations run as variant batches. Each variant starts from the batch fixture, changes settings
through public Settings controls, and captures S1, S2, S3 where a Brushes control exists, and S6 in
phone landscape. A variant also captures `S2r`: the first settled frame after a relaunch with the
drawer left open. Variants run in Raised and Flat, light, both orientations, on every DS-1 target
and viewport:

* V1: the Tool Drawer switch off (B0102, E0510, E0511).
* V2: one optional brush, Crayon on with Magic and Eraser off (E0507).
* V3: no optional brushes (E0508).
* V4: every optional action off: "Crayon", "Magic brush", "Eraser", "Stroke width" and "Undo" under
  Drawing Tools, plus Coloring, Camera and AI (E0509, E0594). The pass rule asserts that the Actions
  Panel, its drawer and its chevron are absent from the first frame on, and that the colors remain.
  S2, S2r and S3 are recorded as absent rather than captured.
* V5: RN web only. `rn-web-chromium` at each viewport that the shipping `palette-trim` and
  `phone-landscape-toolbar` specs name, including the 906-wide phone, capturing S1, S2 and S6 (E0585
  to E0589, E0591, E0606).

Button Size variants run in A11Y-1, and disabled chrome during save and clear in DS-2.

**Size.** Each phone target or viewport yields 8 recordings and 164 stills per arm, and each tablet
target or viewport 8 recordings and 160 stills. Across eight targets and viewports and two arms that
is 128 recordings and 2,592 stills, compared as 64 recording pairs and 1,296 still pairs. Phone
landscape adds one `-closed` still for each of S8 to S11. V1 to V4 add at most 4 variants × 8
targets and viewports × 2 arms × 4 axis combinations × 5 states, which is 1,280 stills; V5 adds
three stills per viewport and arm.

## Other protocols

Each protocol follows the shared rules above. When a requirement names one platform, the CSV narrows
that row's targets.

### DS-2: Drawing-screen chrome interaction and motion

* **Fixture:** The DS-1 fixture, with F1 to F3 drawn when a state needs ink.
* **Steps:** Record video of each requirement's interaction:
  * palette, custom-colour and picker semantics, including a double tap on an opener (P3, X25);
  * drawer cascade and collapse, flyout entry and exit, brush face roll, swatch bloom and release;
  * Undo cues, ghost and spin; the Clear drag, coachmark and sheet flight (T1-13);
  * a Raised-to-Flat switch with ink present (X27, B0109), and disabled chrome during save, clear
    and settings writes (X5);
  * each motion again under in-app Reduce Motion.
* **Settled phase:** Video from the input until the settle rule holds.
* **Compared:** The state before and after each step, which motion cues appear and in what order,
  and their frame-timestamped durations.
* **Pass:** End states pass the DS-1 rule, and every cue the reference shows is present. Timing is
  within two recorded frames of the reference or of the source-defined duration.

### DS-3: Ink, brushes, Undo and Clear output

* **Fixture:** A fresh install in Raised and light, in both orientations, on blank paper and on the
  first Farm page.
* **Steps:** Scripted single-contact strokes per requirement:
  * a dot and a stroke, smoothing, each brush, and the eraser over each brush;
  * Magic over a page and over blank paper; a page change and a theme change with Magic ink;
  * rotation with ink; 25 strokes and 20 Undos (P5); Clear, and Undo of Clear;
  * the colour-change debounce timing.
* **Settled phase:** The settle rule after the last stroke or command.
* **Compared:** The paper region pixel by pixel outside grain, the Undo count and enablement, and
  blank detection.
* **Pass:** Ink geometry within 2 points; the same colours; crayon and Magic texture judged
  equivalent from the originals; identical Undo cardinality and history depth. Multitouch, Pencil
  and held-rotation cases belong to PHY-1.

### PHY-1: Physical drawing sanity and input fidelity

* **Fixture:** Both arms on `physical-ipad` and `physical-galaxy`, inside a bounded operator window
  (see `operator-windows.md`).
* **Steps:**
  1. Physical stroke cardinality with the joined negative control (#2921).
  2. One drawing-screen sanity pass through the DS-1 states S1 to S12.
  3. Fast scribbles, for sample density and coalescing.
  4. Five-finger strokes and multi-finger Undo.
  5. A palm on the paper while the other hand uses a swatch, Clear, Undo and the drawer (P2, X4).
  6. Edge swipes and system-gesture edges.
  7. A contact held on the paper through a rotation (P6).
  8. Pinch in Settings and on the AI result.
  9. Apple Pencil cases, only if a Pencil is paired during the window. The Pencil and Scribble rows
     for RN web (B0012, L0027, L0028, E0281, E0424 to E0427) run in Safari on the iPad, with the
     `rn-web` and `web-prod` arms instead of the native ones.
* **Settled phase:** Each gesture ends with the settle rule; held cases are timestamped.
* **Compared:** The resulting ink, Undo units and chrome activation, the actual contacts, and the
  sample count per stroke.
* **Pass:** The same outcome as the reference arm on the same device, no stray ink, and one Undo
  unit per stroke group.

### OV-1: Overlay visual matrix

* **Fixture:** The DS-1 fixture. Overlays open through public controls, and AI states through AI-1
  fixtures.
* **Steps:** Settled stills of:
  * the toolbar behind Settings, the picker, the books, the gate and each AI state (T1-7);
  * the colour picker (T1-8), and the books, pages, active chip and download progress (T1-9);
  * the Settings hub, compact and wide (T1-10), and all 12 sections (T2-1);
  * the gate fresh, after a wrong answer, and in lockout (T1-11);
  * Parent Center locked, unlocked, and in its Never confirmation (T2-2 to T2-4);
  * AI Settings off, on, and with a saved key (T2-5 to T2-7);
  * the feedback preview, What's New and About (T2-8 to T2-10);
  * activity dots after six launches (T2-11);
  * the picker and book grids at each width.
* **Settled phase:** The shared settle rule. The gate's literal 0 s and 3 s states are captured at
  those offsets.
* **Compared:** The DS-1 elements, plus the dialog frame, title, scroll cue and backdrop.
* **Pass:** The DS-1 rule. The iOS blur and Android dim backdrops are accepted settled differences.
  The saved-key state needs an owner-entered credential in the human session, with capture suspended
  during entry.

### OV-2: Settings, Parent Center and gate behavior

* **Fixture:** A fresh install of both arms.
* **Steps:** Run each requirement's flow through public controls:
  * drilling in and Back, the scrim and close; the hub switches; Night Mode and the theme picker
    (X33);
  * Sound, Button Size writes and the Drawing Tools toggles;
  * gate problems, wrong answers, lockout timing and the Per session policy (P14, X16, X38);
  * the Parent Center Never warning (X65), and the feedback form and its outcomes (X36);
  * seen tracking and activity dots (X17).
* **Settled phase:** The settle rule after each step. Timers use the device clock.
* **Compared:** The visible state after each step, the persisted state after a cold relaunch, and
  the sequence of dialogs.
* **Pass:** The same states and transitions as the reference, with timers within one second of their
  source-defined values.

### A11Y-1: OS text size, Button Size and Reduce Motion

* **Fixture:** The DS-1 and OV-1 fixtures with one axis changed:
  * the largest OS text: `xcrun simctl ui … content_size accessibility-extra-extra-extra-large`, or
    the maximum Android `font_scale`;
  * Button Size at 70% and at its maximum;
  * OS Reduce Motion on, and in-app Reduce Motion on.
* **Steps:**
  * Capture Settings and the dialogs at the largest text (T2-19, T2-20).
  * Capture DS-1 states S1, S2, S3 and S6 at Button Size 70% and at its maximum, in Raised and Flat
    and both orientations, on every DS-1 target and viewport (T2-21, T2-22, X37, E0094, E0098,
    E0592, E0608).
  * Capture the six-button row with AI turned on, its allowance answered by the AI-1 fixture server,
    at both Button Size ends (E0028).
  * Replay the DS-2 cues under each Reduce Motion source (T2-17, T2-18).
* **Settled phase:** The shared rule, or video for motion.
* **Compared:** Clipping, wrapping, reachability, the Button Size ceiling, and which cues run.
* **Pass:** The DS-1 rule, and the same set of reduced cues as the reference.

### A11Y-2: Accessibility tree

* **Fixture:** A fresh install, in the DS-1 and OV-1 states.
* **Steps:** Dump the accessibility tree at each state. Open and close each dialog, and record where
  focus lands after the close.
* **Compared:** Names, roles, states such as pressed, checked and disabled, target sizes, and focus
  return (X59, B0341 to B0345).
* **Pass:** The same names, roles and states as the reference, or a reviewed accepted rename.
  Targets are at least 48 points, and focus returns to the opener.

### KEY-1: Hardware-keyboard input

* **Fixture:** Both arms on the iPad simulators and the API 36 tablet emulator, and on RN web.
* **Steps:** Send hardware key events: WebDriverAgent key events through UIKit's hardware-key path
  on iPad, `adb shell input keycombination` on Android, and the Playwright keyboard on web. Cover
  Cmd or Ctrl+Z on the drawing screen and inside a text field, Escape on flyouts and dialogs, gate
  digits, Backspace and Enter, and arrow keys in segmented pickers (P15, X49, B0020, B0206).
* **Compared:** The resulting drawing, dialog and focus state.
* **Pass:** The same result as the reference.

### PHY-6: Assistive speech

* **Fixture:** VoiceOver on `physical-ipad` and TalkBack on `physical-galaxy`, inside an operator
  window.
* **Steps:** The prepared route through the palette, drawer, Clear, Settings, a slider adjustment
  and focus return (T2-23, T2-24), plus the lockout and save-failure announcements.
* **Compared:** Private recordings of the spoken output.
* **Pass:** The same spoken names, values and order as the reference. Labels alone never pass.

### SAVE-1: Save Picture, polaroid, failure banner and Auto-Save on Delete

* **Fixture:** A fresh install with F1 to F3 drawn.
* **Steps:**
  1. Save Picture, then a burst of taps and the cooldown (X43).
  2. Save while drawing continues (X5).
  3. The failure banner (T1-14). On iOS simulators, revoke Photos access with
     `xcrun simctl privacy … revoke photos-add`. Android 11 and later cannot deny the MediaStore
     path, so the Android banner subcase runs on API 29 under SAVE-2.
  4. Auto-Save on Delete with a failing save (X9).
  5. Held pictures across a relaunch (X10).
  6. On Android 11 and later, the file in `Pictures/Splotch` (B0298).
* **Compared:** Polaroid flight timing, banner copy and layout, the order of save and clear, and the
  written PNG bytes against the export expectation.
* **Pass:** The same outcome and copy as the reference. Actual Photos library writes belong to
  PHY-3.

### SAVE-2: Older-Android storage

* **Fixture:** Fresh API 24, 26 and 29 emulators, with both arms from qualified APKs.
* **Steps:** Save; deny, then grant, the legacy storage prompt; Save again; Auto-Save on Delete,
  then Clear (P8, X8, B0131, B0299).
* **Compared:** The prompt sequence, the banner, and the written file location and bytes.
* **Pass:** The same files and states as the reference.

### PHY-3: Photos permission round trip

* **Fixture:** Both arms on `physical-ipad`, with Photos permission reset for each suffixed app.
* **Steps:** Deny, retry, open Settings from the banner, grant, return and retry (P9). Kill the app
  after a permission change and relaunch it (B0302).
* **Compared:** The banner, the gated Open Settings, the actual saved asset, and the restored
  permission.
* **Pass:** The same states as the reference, with the synthetic asset present.

### COL-1: Coloring library, downloads and network policy

* **Fixture:** A fresh install. On Android emulators, Data Saver
  (`cmd netpolicy set restrict-background true`) and airplane mode; on RN web, Playwright offline
  and Save-Data. The iOS offline and Low Data Mode subcases are blocked under
  `ios-network-conditions`.
* **Steps:**
  * the fresh Farm open; download triggers by stroke and by picker open (X18);
  * drawing during a download (X20); Coloring off, and removing downloads (X50);
  * the phone resolution tier (X52), the mid-open Back (X53) and the active-page chip;
  * foreground downloads while drawing (P7).
* **Compared:** The book list and counts, the picker state, the bytes downloaded, and the applied
  page.
* **Pass:** The same states as the reference. Background continuation belongs to PHY-4.

### LIFE-1: Restart, cold launch, Back, orientation and recovery

* **Fixture:** A fresh install of both arms.
* **Steps:**
  * a process restart with settings changed and ink drawn (P1): settings survive and ink does not,
    as the settled removal of restoration expects;
  * cold launch, its first frame, and when input is first accepted (B0018);
  * Android Back from a section, a dialog and ink (P16, X63);
  * orientation lock choices and the tablet first-launch default;
  * the forced renderer-fault Error Screen through the named test fixture (T2-16, X54), and the root
    boundary (X21);
  * a storage read failure through the named fixture, where settings handling is the settled gated
    reset.
* **Compared:** The resulting screens, the persisted state, and the first frame.
* **Pass:** The same as the reference. The iOS top band coloured from launch is an accepted settled
  difference.

### PHY-4: Background, resume, idle and system navigation

* **Fixture:** The physical devices, in an operator window.
* **Steps:** Background and resume with ink, open dialogs, the AI card and downloads in progress
  (X20, X29). Idle past auto-lock (P17, X56). Bottom-edge system navigation and system-bar reveal
  (P18, B0016). The status bar hiding again after resume (X58).
* **Compared:** The ink, dialog and download state after returning; screen-sleep timing; stray ink.
* **Pass:** The same as the reference on the same device.

### AI-1: AI flow through deterministic fixtures

* **Fixture:** A labeled fixture server answers the hosted AI endpoints, driven through the
  production components and native adapters. It covers success, refusal, retry, "Still not working",
  report confirmation, timeout, 429, a poll past 240 s, attempt 33 (X2) and malformed bodies. No
  call is paid.
* **Steps:** The prompt, dial, minimize, result, report, and the settings deep link (T1-12, T2-12 to
  T2-15). The offline AI button runs on Android emulators and RN web (X15); its iOS subcase is
  blocked under `ios-network-conditions`.
* **Compared:** The visible states, the recorded request bodies (upload format for X30, report
  Origin for X3), and retry behavior.
* **Pass:** The same states and requests as the reference. A fixture never proves live delivery.

### AI-2: Live generation and picture report

* **Fixture:** The human session. The owner enters an existing credential directly, and capture is
  suspended during entry.
* **Steps:** Charge the persistent campaign counter atomically before each dispatch. Run one
  successful generation and one real picture report per native platform, plus RN web (P13, the T1-12
  result).
* **Compared:** Server acceptance, and the result and confirmation layouts.
* **Pass:** The server accepts the report, and the layouts pass the OV-1 rule. Each charge is
  recorded against the cumulative allowance in `README.md`.

### PHY-2: Audio and haptics

* **Fixture:** The physical devices with their volume state recorded, in an operator window.
* **Steps:**
  * the Clear drag ladder, reversal and short release (P11, X23);
  * the page-turn sound and the pencil scratch (X60);
  * haptics on the Clear threshold and the Pencil double tap.
* **Compared:** Private audio recordings and the haptic events.
* **Pass:** The same sounds and timing as the reference. The iOS ring/silent switch cases (P10, X24,
  B0352) stay blocked without a physical iPhone.

### PHY-5: Performance, refresh and thermal

* **Fixture:** Release builds of both arms on the physical devices, under the capture-session rules
  in `docs/PROFILING-CAMPAIGNS.md`.
* **Steps:** The documented drawing and twelve-Undo workloads; the first-open cost of Settings and
  the overlays (B0151, B0152, X62); per-frame work during drawing.
* **Compared:** Each quantity, reported under the name of what it measures.
* **Pass:** Thresholds are defined before measurement. Historical numbers are advisory.

### INFO-1: Information pages

* **Fixture:** Both arms on the native targets.
* **Steps:** Open the in-app privacy policy, release history and feedback pages from Settings and
  About. Exercise the contents navigation, section links, footers and the Parent Center entry (X35,
  B0201, B0202).
* **Compared:** The DS-1 visual rule, gating and navigation.
* **Pass:** The same as the reference. On web these routes stay hosted SvelteKit pages, and WEB-1
  checks that they resolve beside the RN-web drawing route (X64).

### WEB-1: RN web platform behavior

* **Fixture:** `rn-web` and `web-prod` served locally. Chromium is the routine browser; Firefox,
  Edge and actual Safari run the browser-dependent rows.
* **Steps:**
  * the install banner and install guide (T2-25, T2-26);
  * service-worker registration, update and offline behavior (X22);
  * browser Back and the drawing guard, the context-menu guard (X57) and the page locks;
  * folder save (X61), the unknown connection type (X19), and the hosted-route disposition (X64);
  * the web credential vault.
* **Compared:** States, storage and network effects.
* **Pass:** The same as `web-prod`.

### AC-1: Two-sided automated contract confirmation

* **Fixture:** The exact-head CI run, through the Browserless tests job's repo-script and RSD tiers.
* **Steps:**
  1. Confirm that each named test exists and passed at that head.
  2. Read the test, and confirm that its oracle comes from shipping source: `web/src`, shipping
     assets, or a shipping-derived fixture, not the RN implementation.
  3. If it does not, move the row to its surface protocol in the CSV.
* **Compared:** The test's oracle against the RN side.
* **Pass:** The test passed at the exact head with a confirmed shipping oracle, and the CI run is
  linked as evidence.

## Out-of-scope and settled rows

Each of the 136 out-of-scope rows carries one reason in `basis`:

* Retained SvelteKit hosted routes and page documents, under the "Retained hosted boundaries" of
  docs/migration/WEB-CONTRACT.md: admin, beta enrollment, the design styleguide, page shells and
  share cards.
* Hosted API server behavior, such as the generate-image upload limits.
* Shipping harness and instrumentation seams, such as work counters and store replay.
* Shipping internals that RN replaces; their user-visible behavior maps through the behavior rows.
* The shipping bundle structure, which ADR-0179 replaces for RN web.
* The WebView-only Scribble guard on native.

The 18 settled rows follow the decisions listed under the shared rules.

## Decisions taken while planning

Each decision is recorded for adversarial review on the PR. None of them reopens a settled owner
decision.

1. **Hardware-keyboard cases run on the iPad simulators and the Android emulator.** The owner's
   physical-only list does not include the keyboard. WebDriverAgent key events travel UIKit's
   hardware-key path, and `input keycombination` reaches Android's key dispatch. This supersedes the
   earlier stance that synthetic keys cannot stand in for hardware.
2. **The Android routine targets** are a phone emulator on API 34, a phone emulator on API 36, and a
   tablet emulator on API 36. That covers both requested API levels on a phone, and the tablet
   layout on the newest API.
3. **The web reference arm** is production web source dd6b86a2343d400bb654bc664020c09768e6c7f5,
   built locally, rather than the v1.6.0 web layer. Production web is what web users have; the
   native reference stays v1.6.0.
4. **The Photos-denied banner visual** runs on iOS simulators through `simctl privacy revoke`. The
   deny, Settings, grant and return round trip and actual library writes stay physical-only.
5. **iOS offline and Low Data Mode subcases are blocked.** iOS simulators share the host network,
   the campaign may not change host network settings, and the network is not on the owner's
   physical-only list. The 14 affected rows stay `blocked` until the owner names a permitted method;
   their Android and web subcases still run.
6. **Assistive speech is physical-only.** Speech is audio output, and simulators have no VoiceOver.
   Accessibility-tree checks still run on simulators, under A11Y-2.
7. **Pinch** in Settings and on the AI result is multitouch, so it is physical-only.
8. **The DS-1 theme axis** is driven by the OS appearance with the app on System, so the X33 Night
   Mode rule difference cannot contaminate the matrix.
9. **Physical subcells on routine rows** are superseded by the targets policy, not deleted from
   `acceptance-subcells.csv`.
