# ADR-0174: iPad Drawing Lost-Frame Is Judged Against the Real-Finger Floor

**Status:** Active — amends
[ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md) and
[ADR-0135](0135-split-device-capture-input-and-measurement.md); builds on
[ADR-0136](0136-browser-target-lost-frame-gate.md) and
[ADR-0144](0144-coalescing-is-a-witness-not-a-check.md); amended by the 2026-09-24 rulings on issues
#2231, #2232, #2233, #2235, and #2236. **Date:** 2026-09

> **Amended (2026-09-24; issues #2231, #2232, #2233, #2235, #2236):** a person-present session took
> the paired capture this record asked for, the first eraser finger captures, the first finger
> captures in the installed app, and three fresh Magic first loads. The maintainer ruled on each,
> and the decisions below are edited in place. **The record stands:** on one commit, in one session,
> the driven pen arm read red and the finger arm green. The pen band becomes **above 1%, up to
> 1.37%**. Eraser is explained by finger capture, not by extension. The native row rests on finger
> captures, not on presumption. The Magic first-load stall is recorded as **not reproduced at
> 8e6700d5**, so Magic is no longer an open product red. The evidence is under "The 2026-09-24
> person session" below.

## Context

The physical iPad web row (`ipad-device-web`) carried ten drawing lost-frame reds at the committed
matrix commit e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3. They were pen in all four modes, Magic in
three, and eraser in three, at 1.02–1.37% against the 1% gate. Paint P95 was 15–16 ms and every
fidelity check passed. Issue #1693 asked whether these cells should get an ADR-0137 budget
exception. Issue #1715 asked whether the reds come from the product or from the capture.

**What drives the captures.** Both iPad device rows take drawing input from XCUITest touch synthesis
through WebDriverAgent. The matrix drives them through Appium (`transport: 'appium'` for both rows
in `tools/perf/lib/campaign-plan.mjs`). The ADR-0135 split transport sends W3C actions to
WebDriverAgent directly. The driver already builds each stroke as one W3C action sequence with a
duration on each move (`trustedGestureActions` in `tools/perf/ios/capture-xcuitest-screen.mjs`).
This is the batched shape that the Android path had to adopt, so the driver has no cadence mistake
left to fix. No other software transport reaches a physical iPad. `safaridriver` drives only macOS
Safari and the iOS Simulator. Appium `mobile:` gestures go through the same XCUITest synthesis. The
WebKit remote-inspector path does not inject input on a physical device. Only a finger or a hardware
actuator can supply finger cadence.

**The real-finger captures.** On 2026-09-07, three `perf:device:hand` captures were taken on the
physical iPad in Safari at e5142fab. The captures use the same product and the same self-reporting
probe as a driven capture, but a finger replaces the synthesized touch. They are in
`perf-profiles/evidence/2026-09-07-issue-1715-transport-tax-hand-floor/`. When the tool recorded
them, it reported "no established regime — not scoreable" and gave a hand-only `late %`, which is a
different metric from the gate's. `npm run perf:rescore -- --target=ipad-device-web` re-scores the
raw frame tables through the shipped scorer, in the row's declared 60 Hz regime. All three observed
a 17 ms beat. The result is the gate's own lost-frame share:

| Cell                    | Real finger (moves/s) | Driven, same cell at e5142fab |   Driven minus finger |
| ----------------------- | --------------------: | ----------------------------: | --------------------: |
| pen / portrait / light  |         0.06% (160.1) |                     1.37% RED |           1.31 points |
| pen / landscape / dark  |         0.04% (154.5) |                     1.22% RED |           1.18 points |
| Magic / portrait / dark |     **1.13%** (127.8) |                     1.15% RED | 0.02 points as scored |

The Magic finger capture has a single in-contact stall of 433 ms. The issue 1715 thread attributes
it to Magic's deferred paint while its sheet loads: strokes are recorded and painted once the
overlay arrives, which is a shipped behavior. That one episode charges 416 ms of the 432 ms that the
capture lost in contact. Without it, the capture loses 15 ms over 38.1 s, which is 0.04%. That
figure is an analysis, not the gate's number: as scored, the gap to the driven cell is only 0.02
points. The driven Magic captures never hit this path: their paint maximum is at most 38 ms. So the
1.13% is a real product cost that a finger felt and the driven cells do not measure. It is not the
transport tax, and this record does not reclassify it.

**The native row.** `ipad-device-native` uses the same transport. Its sixteen drawing cells at
e5142fab read 0.00–0.09% (`perf-profiles/evidence/2026-09-06-epic-1567-ipad-native-e514/`). It has
**no drawing lost-frame reds**. Because the transport only adds lost frames, that reading also caps
what the transport can cost on the native row at 0.09 points. That is two orders of magnitude below
the Safari tax, so the tax is not a fixed cost of the transport. It comes from how the transport
interacts with Safari and with the brush's per-move work. Crayon on the same web row reads
0.22–0.47% driven. **When this record was accepted, the native row's tax had never been measured
with a finger** (the 2026-09-24 session below measured it). Nobody had drawn by hand in the bundled
app, which is the configuration the row scores. The closest captures were the 2026-08-25 pair in
`perf-profiles/evidence/2026-08-25-hand-wkwebview/` (pen 0.00%, crayon 0.09%). They were drawn in
the same WKWebView, but with the page delivered remotely from the probe host, at an older commit.
ADR-0144 showed that delivery changes what that WebView reports, so these captures do not stand in
for the bundled build.

**A fresh driven control on current main.** On 2026-09-22 the campaign orchestrator captured pen on
the physical iPad (12.9-inch iPad Pro, iPadOS 26.5, Safari 26.5): portrait, light, the app's drawing
route, product commit 3511b95ccdfb9677cfcf60b989fadb50ad074020. It used the split transport, with
WebDriverAgent W3C actions for input and the HTTP self-report probe for measurement. It observed a
17 ms beat (60 Hz): 4,113 frames over 68.7 s in contact, **1.27% lost-frame share (FAIL against
1%)**, and no stall episodes. Paint P95 was 16 ms. The input ran at 115.95 moves/s and 1.94 moves
per frame, and all four fidelity checks passed (`trustedTouch`, `cadence`, `pressure`,
`contactGeometry`). The capture is kept, with the LAN host redacted, in
`perf-profiles/evidence/2026-09-22-issue-1715-driven-control/`. The artifact's own `productCommit`
field is null. The commit comes from the operator's record and is stamped into that corpus's
`index.json`. The corpus README gives the served build digest. This reproduces the driven pen red
(1.22–1.37% at e5142fab) on a later product, through the same probe host and upload path the finger
used. On this evidence the difference does not come from the measurement channel: only the input
differs from the finger captures. It is still not the paired capture described in the evidence
limits below, because the product commit and the session differ.

**The 2026-09-24 person session.** The maintainer sat at the physical iPad (iPadOS 26.5) for
`npm run perf:session:person`. Every web capture below is at product commit
8e6700d5d801eb481a4bde3d47cea69135dd71b4. Each observed a 17 ms beat, passed every fidelity check,
and re-scores to the figure shown with `npm run perf:rescore`. They are kept in
`perf-profiles/evidence/2026-09-24-epic-2210-person-ipad-device-web/` and
`perf-profiles/evidence/2026-09-24-epic-2210-person-ipad-device-native/` (PR #2264, merge
f80a9372cc2a1a1064f6cf058cdc8c2b283ff58c).

| Row    | Brush  | Mode            | Input                         |   Lost frame | Issue |
| ------ | ------ | --------------- | ----------------------------- | -----------: | ----- |
| web    | pen    | portrait/light  | driven                        |    1.18% RED | #2235 |
| web    | pen    | portrait/light  | finger                        |           0% | #2235 |
| web    | Magic  | portrait/dark   | driven                        |        0.91% | #2235 |
| web    | Magic  | portrait/dark   | finger, three fresh loads     | 0/0.04/0.09% | #2232 |
| web    | eraser | landscape/light | finger                        |        0.04% | #2231 |
| web    | eraser | landscape/dark  | finger                        |           0% | #2231 |
| web    | pen    | landscape/dark  | finger                        |           0% | #2233 |
| native | pen    | portrait/light  | finger, installed bundled app |           0% | #2236 |
| native | Magic  | portrait/dark   | finger, installed bundled app |           0% | #2236 |

* **The paired capture (issue #2235).** Both arms ran in one session through one probe host. The
  driven arm was `perf:device:frames --platform=ios` (WebDriverAgent W3C actions, ten passes), and
  the finger arm was `perf:device:hand --open=safari`. Pen read driven 1.18% (red) against finger
  0%, a gap of 1.18 points on one commit. Magic read driven 0.91% against finger 0%. This is the
  prediction the record made, and it held.
* **Eraser (issue #2231).** These are the first eraser finger captures: landscape-light 0.04% and
  landscape-dark 0%, each on a page filled and verified once before the sweep. The 2026-09-23 matrix
  refresh read the driven eraser cells at 3928cd88edbf441530e473a4e3c0b6767926bfc6 red: 1.03%
  landscape-light and 1.01% landscape-dark.
* **The landscape-dark pen reading (issue #2233).** The same refresh read landscape-dark pen at
  1.13% (paint 15/24/39 ms), below the band recorded then (1.22–1.37%), which did not say how a
  reading below it counts. The landscape-dark pen finger capture reads 0%. The only commit between
  3928cd88 and 8e6700d5 that touches the measured surface is
  a83c52ab8738b40817a252875a5149d8d71a6b98 ("Pad PageShell by the safe area at every breakpoint").
* **The native row (issue #2236).** These are the first finger captures in the installed app: the
  bundled build 439cd3c3d8e78f02be1f86ad6a540d12acc5c982 (`perf:build:cap` and an `xcodebuild` Debug
  build, no `server.url`, `contentInset: never`), whose product tree equals the session's. The route
  was `perf:ios:bundled:frames --hand-input`, with WebDriverAgent attached but not driving. Pen and
  Magic both read 0%.
* **The Magic first-load stall (issue #2232).** Each Magic finger capture opened a fresh Safari
  page, so its first stroke was the sheet's first load. The worst in-contact frames were 25, 29, and
  40 ms, and none exceeded four beats (66.7 ms). The 433 ms stall of the 2026-09-07 capture did not
  reproduce in three fresh first loads.

Options weighed in #1693 and #1715:

1. **A measured 1.5% exception for pen, Magic, and eraser** in `LOST_FRAME_TIME_SHARE_EXCEPTIONS`,
   following ADR-0137. Rejected. An exception is a budget: it says that the product costs more than
   the gate allows. Here the product under a finger costs about 0.05%, so an exception would set the
   gate from the automation instead of the thing it is supposed to measure.
2. **Keep the ten cells red until the transport improves.** Rejected. No better transport exists for
   a physical iPad (see above), so the cells would stay red indefinitely. That is the same
   completion-gate problem ADR-0160 rejected.
3. **Build a paired driven-vs-hand harness first, then decide.** Deferred. A paired capture is the
   confirmation this record names below. The maintainer decided on the evidence already in hand.
4. **Judge iPad drawing lost-frame against the real-finger floor, and reclassify the ten reds as an
   instrument artifact.** **Chosen** by the maintainer on 2026-09-22.

## Decision

### 1. Which number judges iPad drawing lost-frame

On `ipad-device-web` and `ipad-device-native`, the product verdict for drawing lost-frame share is
the **real-finger floor**. That is a `perf:device:hand` capture of the brush on that row at that
product commit, re-scored with `npm run perf:rescore -- --target=<row>`. It must pass the fidelity
checks and observe the row's declared refresh regime. A finger capture that observes a different
regime cannot be compared with the row. The 2026-08-23 Safari hand corpus shows that this happens:
two fast captures observed an 8 ms beat. See decision 5.

The driven capture's lost-frame share is instrument evidence. Read it as follows:

* **A driven green stands.** This record assumes the transport only adds lost frames. Every pair
  measured so far supports that: the finger read lower each time. On 2026-09-07 it was also the
  heavier workload, at 128–160 moves/s against about 116. In the 2026-09-24 pair both arms ran at
  about 116–119 moves/s. So a driven green stays green, and only a driven red is in question. A
  driven green still comes from input slower than a finger, and ADR-0135 already notes that such
  input does not exercise the case where input arrives faster than frames. This record does not
  change that limit.
* **A driven pen red on `ipad-device-web`, with passing paint gates and a reading above 1%, up to
  1.37%, is explained by this record.** Pen is the brush whose band is checked against the gate's
  own metric. Every pen finger capture passes as scored (0–0.06%), and the smallest
  driven-minus-finger gap is 1.18 points, measured twice: across sessions on 2026-09-07, and on one
  commit in one session on 2026-09-24. If a real product red (above 1%) had that tax added, the
  driven reading would be above 2.18%, well over the band. So a pen reading up to 1.37% is
  consistent with a finger floor near zero. The ceiling is the highest driven pen reading measured
  (1.37% at e5142fab). The floor was the lowest one (1.22%) until the 2026-09-24 ruling on issue
  #2233 lowered it to the gate: a reading nearer the finger floor is, if anything, less suspicious.
  The accepted risk is that the band now explains any driven pen red from just over 1% to 1.37%. The
  measured paired gap and the unchanged paint gates bound it. This is how the driven capture keeps
  detecting relative regressions: **a driven pen reading above 1.37% is not explained. It needs a
  real-finger capture at that commit.** A green finger capture explains the cell. A red finger
  capture makes it a product red.
* **A driven eraser red on `ipad-device-web` is explained at two commits only, by finger capture:**
  1.19–1.25% at e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 and 1.01–1.03% at
  3928cd88edbf441530e473a4e3c0b6767926bfc6. The eraser finger captures read 0.04% landscape-light
  and 0% landscape-dark (issue #2231). The disposition table holds the two ranges as one band,
  1.01–1.25%, limited to those two commits. Eraser has no paired capture, so it has no band of its
  own: a driven eraser red at any other commit needs a finger capture at that commit.
* **Every other new driven drawing lost-frame red on the two iPad rows needs a finger capture before
  it is explained.** That includes Magic at any commit, any native red, and any other brush. Magic's
  finger floor now passes as scored: 0–0.09% over three fresh first loads, and 0% against 0.91%
  driven in the pair. No driven Magic red has been measured to set a band from. The native row's
  floor is the two installed-app finger captures, pen 0% and Magic 0% (issue #2236). It has no
  measured band, and its driven readings cap the transport's cost there at 0.09 points.

Crayon keeps ADR-0137's 1.5% exception on both iPad rows. That exception was sized from driven
captures, and no Safari finger capture of crayon exists. Its driven readings (0.22–0.47% web,
0.00–0.04% native) sit well inside it. This record does not resize it.

### 2. The ten e5142fab reds are an instrument artifact

The ten driven `ipad-device-web` drawing lost-frame readings at e5142fab are reclassified as
**instrument artifacts of the synthesized-touch transport**, not product costs. For the seven pen
and eraser cells, this record is their disposition under the ADR-0160 definition: it states the
measured basis, the attribution, and the reopen condition, and the cells count as explained. The
three Magic cells did not, for the reason below, until the stall's 2026-09-24 disposition. The basis
differs by brush:

* **Pen (4 cells): measured.** Two finger captures, covering both orientations and both themes, read
  0.04–0.06% against 1.22–1.37% driven. The 2026-09-22 control reproduces the driven red on current
  main, and the 2026-09-24 paired capture confirms it on one commit.
* **Magic (3 cells): reclassified, and the stall is not reproduced at 8e6700d5.** The 2026-09-07
  finger capture reads 0.04% outside its single 433 ms first-load stall, against 1.02–1.15% driven,
  so the driven readings are transport, not steady-state drawing cost. As scored, though, that
  capture fails at 1.13%, which left the Magic cells an **open product red** (the first-load stall,
  not the transport) until the stall had its own disposition. The 2026-09-24 ruling on issue #2232
  gives it one: **not reproduced at 8e6700d5.** Three fresh-load finger captures at
  8e6700d5d801eb481a4bde3d47cea69135dd71b4 read 0%, 0.04%, and 0.09%, and no in-contact frame
  exceeded 40 ms. Magic is no longer an open product red. The disposition reopens if any real-finger
  Magic capture shows an in-contact frame over 50 ms, the paint-max gate. Three gaps are untested:
  * repeated clears within one page (a clear calls `ensureMagicSheet` when Magic is active, in
    `web/src/lib/drawing/engine.ts`);
  * a second mode (only portrait/dark was captured);
  * whether any delay is visible to a user.
* **Eraser (3 cells): by finger capture.** No finger capture of eraser existed when this record was
  accepted. The cells were reclassified by extension, because their driven readings (1.19–1.25%) sat
  below the top of pen's measured band, on the same row and commit, with the same paint time. The
  2026-09-24 ruling on issue #2231 replaces the extension with the eraser finger captures (0.04%
  landscape-light, 0% landscape-dark). The same captures explain the two 3928cd88 driven eraser reds
  (1.03% and 1.01%). The explanation still covers only the readings decision 1 names: a later driven
  eraser red needs a finger capture at its own commit.

### 3. What the driven captures keep

The driven captures keep every other job they already do:

* the input-fidelity verdict (trusted touch, cadence, pressure, and contact geometry);
* the paint P95, P99, and max gates, where driven and finger agree (15–16 ms P95);
* relative regression detection for lost-frame share, through the band in decision 1;
* **all discrete-action cells**, which remain scored from driven captures.

The discrete-action carve-out rests on narrower evidence than the #1715 thread's summary suggests,
so here it is exactly. The roughly 2 ms driver share was measured on the **Android** web Night Mode
toggle, in the paired Chrome trace for issue #1696 (ADR-0162). It was not measured on the iPad. The
iPad action reds were attributed by Instruments recordings aligned to the probe's timestamps (issue
#1692, ADR-0160) to GPU-process and WebContent product work. That work includes IOSurface pool
eviction, surface creation, compositing, and layout. Those traces show that the product owns the
slow frames, and they find no automation script evaluation inside them. They do not put a number on
the driver's share. The carve-out assumes that on the iPad a discrete action's tap is dispatched
before the timed frames start. That assumption is reasonable, but nobody has measured it there.

### 4. How the matrix represents it

> **Amended (issue #2222):** the generator now renders the disposition this section lacked. The
> table `LOST_FRAME_DISPOSITIONS` in `tools/perf/lib/drawing-gates.mjs` lists the reds this record
> explains, as decision 1 states them after the 2026-09-24 rulings: pen on `ipad-device-web` above
> 1%, up to 1.37%, and eraser there only at e5142fab and 3928cd88, inside 1.01–1.25%. A red
> qualifies only when every paint gate passed. It is an annotation, not a scoring state: the scorer
> and every published number are unchanged, and a covered cell still reads FAIL. The cell draws a
> dashed red edge and links this ADR. The calibrated row's summary counts open reds apart from
> explained ones. `tools/perf/tests/drawing-dispositions.test.mjs` fails if this record stops
> stating the bands or the commits. Magic, native, and pen readings above 1.37% stay open reds. The
> Magic stall's disposition needs no entry: no driven Magic cell is red.

The scorer and the published verdicts do not change. The ten cells still render the lost-frame share
the driven capture measured, marked FAIL, because that is what the instrument read. The drawing
scorer has no "explained instrument artifact" state. Its only existing mechanism,
`LOST_FRAME_TIME_SHARE_EXCEPTIONS`, is a product budget, and option 1 rejected that. Building a new
scoring state for one decision would be speculative surface. So the reclassification is recorded in
two places. One is this ADR. The other is the matrix's capture-limitations note, which is in the
`limitations` array of `sources.json` and in each published copy of it.

The 2026-09-06 report could not be rebuilt for this change. Its raw inputs are untracked. With the
copy from the capture host restored, the current generator stops on one of them: "is marked full but
its actionPlan records a subset action run". Finding out why is outside this record. So this change
edits that one limitation string in `sources.json`, `data.json`, `index.md`, and `index.html`
exactly as the generator would write it, and changes no other byte. The next matrix regeneration
will carry the `sources.json` text forward.

### 5. The 60 vs 120 Hz question, for the scored route

`docs/PROFILING-IPAD.md` records a 60 Hz Safari rAF beat on this iPad. The 2026-09-18 issue 1750
baseline recorded 120 Hz (a median idle interval of 8.0 ms) on the `/dev/engine` harness page. The
2026-09-22 control observed 17 ms on the app's drawing route, and so did every driven and finger
capture in this record. So `ipad-device-web`'s declared `60hz` regime holds for the route the matrix
scores.

The 2026-08-23 finger corpus (`perf-profiles/evidence/2026-08-23-hand/`) shows that the app route
has also run at 120 Hz. Two fast finger captures, at 237.8 and 268.4 moves/s, observed an 8 ms beat,
while the slow one, at 117.5 moves/s, observed 17 ms. It is **not established** why those captures
and `/dev/engine` read 120 Hz. The routes, days, and input rates all differ. A finger capture used
under decision 1 must therefore observe 60 Hz to be compared with the row.

## Evidence limits

* **n = 1 finger capture per cell**, except Magic portrait/dark (four captures across two commits)
  and pen portrait/light and landscape/dark (two each). The web finger captures cover pen in two
  modes, Magic in one, and eraser in both landscape modes. The native ones cover pen and Magic in
  one mode each. Apart from the pair, each was taken in a different session, and at a different
  commit, from the driven cells it is compared with. The 3928cd88 eraser and landscape-dark pen reds
  are explained by finger captures at 8e6700d5.
* **One paired capture has been run** (issue #2235): pen and Magic, one mode each, one capture per
  arm, on iPadOS 26.5. It drove and drew by hand on the same commit, in the same session, through
  the same probe host, and it confirmed this record. Eraser has never been paired. Every 2026-09-24
  capture is on iPadOS 26.5.
* The finger captures were not scoreable when they were taken ("no established regime"), and the
  hand tool's `late %` is not the gate's lost-frame share. The figures above come from re-scoring
  the raw frame tables with the shipped scorer in the declared regime. They are not the hand tool's
  own figures, which were 0.2%, 0.0%, and 0.2%. The 2026-09-24 captures were judged in the declared
  regime when they were taken.
* The Magic first-load stall is not reproduced in one mode, in fresh page loads only. The three gaps
  decision 2 names are untested.

## Reopen condition

Reopen this record, and treat the affected cells as product reds, if any of the following happens:

* A paired driven-vs-hand capture shows the **hand arm also red** on the same commit. That would
  bring back the product-floor explanation this evidence retired.
* A finger capture of eraser in the declared regime reads red.
* A real-finger Magic capture shows an in-contact frame over 50 ms, the paint-max gate. That reopens
  the Magic first-load stall's "not reproduced at 8e6700d5" disposition and makes the Magic cells an
  open product red again.
* A driven pen reading on `ipad-device-web` rises above 1.37% and a finger capture at that commit
  reads red. That is an ordinary product red under decision 1. It reopens this record only if the
  gap between the driven and finger readings has shrunk below about one point, because the pen band
  argument rests on that gap.
* The transport changes. For example, a hardware actuator or an XCUITest release changes how touch
  is synthesized. The band was measured on the current transport and must be measured again.

## Consequences

* \+ Seven of the ten reds (pen and eraser) are resolved on a measurement that could have gone the
  other way. If the finger had also read about 1.2%, this record would owe a real allowance or more
  product work. The three Magic cells move from a transport question to a named product one.
* \+ The 2026-09-24 session tested the record where it could have failed, and it held: the paired
  capture, eraser, and the native row all read the finger floor at or near 0%. It explains the three
  3928cd88 drawing reds on the calibrated row (landscape-dark pen, and eraser in both landscape
  modes), and it closes the Magic stall as not reproduced.
* \+ The driven captures stay useful. Fidelity, paint, action cells, and lost-frame regression
  detection all keep running unattended. Only the lost-frame verdict on the iPad drawing path moves
  to the finger.
* \+ The native row's clean result is recorded as a finding in itself: the same transport costs at
  most 0.09 points there. The "transport tax" is therefore specific to Safari and to the brush.
* − **The matrix still renders seven FAIL cells that the release process treats as explained.**
  ADR-0160 rejected exactly this state for action cells, because the matrix then shows red that
  releases ignore. Here the alternative is a budget that misstates what the product costs. The
  limitation note is the mitigation. A rendered disposition marker in the generator would be the
  real fix.
* − A drawing lost-frame verdict on these rows can now need a person at the iPad. The pen band keeps
  pen unattended. Any Magic or eraser red, and any pen reading above the band, cannot be settled
  overnight.
* − Eraser was reclassified by extension, and the native row was covered by presumption. The
  2026-09-24 finger captures closed both gaps (issues #2231 and #2236), but only for eraser's two
  named commits and for one mode per brush on the native row.
* − The Magic first-load stall (433 ms in contact, 1.13% as scored) was a product cost that the
  driven Magic cells cannot see. It is recorded as not reproduced at 8e6700d5, not as fixed: nothing
  in the product changed to remove it, so it can return, and the reopen condition watches for that.
* − The pen band is a threshold derived from three measured pairs, one of them paired on one commit.
  It assumes the tax adds at least about one point and stays stable. Both assumptions rest on n = 3
  plus one control. With its floor at the gate, the band also explains a red that sits just over 1%,
  which no pair has measured directly.
