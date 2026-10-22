# Splotch performance inventory

Splotch's active performance surface is the React Native app and its web export (ADR-0182).
`docs/PROFILING.md` owns the measurement workflow; the `profiling` skill routes to the in-app probe
and replay instructions. The app remains in `experiments/native-architecture/` until root promotion.

## Active measurements and gates

| Concern               | Instrument / enforcement                                      | Meaning                                                                          |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Native drawing        | In-app contact-cohort probe and committed replay traces       | Per-cohort work and input-to-submission latency on the named device.             |
| Replay validity       | Replay `emissionLateness`                                     | A replay delayed beyond a frame is discarded; it measures the hold.              |
| Android presentation  | `gfxinfo framestats` and Perfetto                             | Platform timing and scheduling that supplement the probe.                        |
| Web page load         | `npm run test:lighthouse:ci`, `tools/page-load/baseline.json` | Throttled FCP/LCP against the committed RN-export baseline.                      |
| Drawing first paint   | `MAX_NATIVE_WEB_FIRST_PAINT_BYTES`                            | First-paint scripts/styles, including the prerendered shell's inline resources.  |
| Drawing core controls | `MAX_NATIVE_WEB_CORE_CONTROLS_BYTES`                          | Every script/style the interactive drawing controls await, counted once per URL. |
| Other web documents   | `MAX_NATIVE_WEB_PAGE_BYTES`                                   | Per-page first-paint and entry budgets.                                          |
| Offline export        | `tools/migration/check-native-web-precache.mjs`               | Integrity, complete precache and offline-shell contract.                         |

The byte caps live in `tools/migration/check-native-web-startup.mjs` and run inside
`npm run build:site`. First paint stays at **47,052 bytes** and core controls at **827,535 bytes**.
The per-page registry owns its own caps; consuming headroom calls for a measured improvement, not an
automatic increase. ADR-0179 and ADR-0180 record the cuts and why first paint and controls have
separate waits.

The probe's native implementation is
`experiments/native-architecture/src/drawing/perfProbe.native.ts`; the plain module is a no-op for
web and type checking. It is opt-in on a Release build. Build and launch details, field definitions
and replay instructions live in `experiments/native-architecture/DEVELOPMENT.md`. A browser frame
trace, a replay's delivery lateness and the time a picture was submitted answer different questions;
none alone proves when ink reached the glass.

## Active product mechanisms

Paths in this section are relative to `experiments/native-architecture/src/`.

* **Keep stroke updates local.** The drawing subtree owns live contact updates. Chrome props do not
  change at contact start, move or lift merely to disable unrelated controls; commands enforce their
  own mid-stroke checks. Mounted guards include
  `tools/migration/tests/rsd-native-stroke-chrome-commits.test.mjs` and
  `tools/tests/native-stroke-chrome-mounted.test.mjs`.
* **Submit one Skia picture per ink change.** `drawing/skiaInkScene.ts` records committed ink
  beneath the live stroke and hands a picture to the native view. Re-rendering a full Skia element
  tree per sample had caused duplicate full-paper blits (ADR-0178);
  `tools/tests/native-skia-ink-view.test.mjs` holds the presentation contract.
* **Keep paper ancestors out of offscreen compositing.** A blend or partial opacity on a view
  holding the paper can turn each stroke frame into a screen-sized extra pass. RSD's flat palette
  pre-mixes its margin-rule ink; `tools/migration/tests/rsd-native-flat-palette.test.mjs` checks the
  mounted ancestry and Fabric paint order.
* **Preserve operation order and history.** `drawing/model.ts` carries per-stroke operation/frame
  information and recognizes appended stroke prefixes. `drawing/checkpoints.ts` reuses verified
  flattened prefixes while retaining the tail needed by the renderer. This is the RN model, not the
  retired tiled Canvas 2D history.
* **Defer product owners until after drawing paint.** `product/afterDrawingPaint.web.ts` waits for
  paint and then schedules idle work. `product/productOwnersLoader.web.ts` and the page entry
  boundaries keep AI, feedback and other on-demand work from becoming first-paint requirements.
  Sharing a small module can still repartition chunks; judge the built output.
* **Prerender a useful first frame.** `prerenderFirstFrame.tsx` and
  `tools/migration/prerender-native-web.mjs` write the shell before its deferred interactive bundle
  loads. They stamp the selected appearance without pulling all settings onto startup (ADR-0180).
* **Keep the book as assets.** The bundled Farm book is present offline; browser artwork has its own
  loading boundary rather than embedding every page in the initial script (ADR-0181).
* **Keep save/export work at its own boundary.** `lazyExport.ts` and `export/` own picture save
  work; the first-paint/control budgets measure the actual browser closure rather than assuming that
  a source-level dynamic import always leaves every dependency deferred.
* **Respect the device's rendering model.** RSD native layout, text, opacity and animation differ
  from browser CSS. The RN rules in `docs/CODING-STANDARDS.md` identify the tested adapters and the
  measured incidents that earned them.

## Lessons retained from the retired harness

The SvelteKit/Capacitor capture system retired in #3160. Its matrix and byte/frame observations are
historical evidence, not scores or gates for the RN app. The original evidence lives under
`scrapbook/performance/`, `perf-profiles/evidence/` and `docs/scratchpad/perf/`; the ADRs record
measurement changes and rejected approaches. The former product inventory described a tiled Canvas
2D renderer and its Svelte boot path, both removed by the cutover. It is available in Git history
rather than presented here as a map of live code.

The terminology and grids below preserve the useful measurement rationale from the 2026-08 campaign.
Every threshold, verdict and target in those sections belongs to that retired harness. They do not
impose a new RN performance budget. Useful general lessons remain: compare the same input and
refresh regime, measure both sides of a threshold, record negative controls, distinguish work time
from presentation latency, and refuse captures whose instrument cannot answer the question.

## Historical measurement terminology

**Frame / beat.** The display's steady frame rhythm — the expected gap between one frame and the
next, like a metronome tick. A 60 Hz screen shows a new frame every ~16.7 ms (its beat); a 120 Hz
screen's beat is 8.3 ms. Nearly everything in scoring is relative to the beat: a "late" frame missed
its tick, "lost frame time" is time not covered by on-beat frames. The beat is never assumed — it is
measured from the capture itself (see *dominant interval*).

**rAF (`requestAnimationFrame`).** The browser API that calls a function once per rendered frame —
but only if asked: it is a one-shot request, and continuous measurement exists only because the
callback re-requests itself. With a live loop on a visible page you reliably get ~one callback per
compositor frame; with no rAF requested and nothing changing, there are **no frames at all** (the
compositor is lazy). Exceptions that matter: hidden/backgrounded pages get throttled or paused (the
stale-tab incident), variable-refresh panels change which rate the loop sees (Chrome boosts to 120
Hz during touch), and power-saving modes throttle delivery. The in-page probe records rAF
timestamps; the gaps between them are the frame data everything else derives from. The rAF timestamp
records when code was **called**, not when its output hit the glass — the browser has until the next
vsync deadline to composite, so a late-starting callback with fast work can still make its slot.

**Dominant interval.** The beat estimator: histogram all frame gaps into half-millisecond buckets
and take the biggest bucket's median — "the rhythm the display actually held." Replaced a fixed
16.67 ms assumption and then a 10th-percentile estimate, both of which mis-billed healthy captures
on variable-refresh displays (ADR-0134). Falls back to the 10th percentile only when no bucket holds
a quarter of the frames (a genuinely erratic capture).

**Refresh regime.** The display speed a target's published numbers are scored against, named by rate
(`60hz` / `120hz`) and classified from the capture's dominant interval into narrow *measured* bands
(16–17 ms ± 1.5; 8.3–8.42 ms ± 0.75). Exists because numbers from different beats are not
comparable: the same iPad cell read 1.3% at a 17 ms beat and 8.19% at an 8 ms beat, both correctly
computed. Targets declare their regime from banked measurement; a capture at the wrong regime is
refused and retried; a target with no declared regime **banks** its captures but the matrix refuses
to score them (the bank-then-declare bootstrap — the declaration evidence is the recapture's own
first artifact).

**Mixed-regime presentation** *(added 2026-08-26)*. An adaptive panel can hold sustained stretches
at the *other* rate inside one capture — the vigorous-hand Safari capture holds a 59-in-contact-
frame 60 Hz run inside a 120 Hz capture, and a scorer pricing against the single dominant beat
charges every frame of such a run ~half its duration as fake loss. A capture is refused as
`mixed-regime` when more than 1.5% of its in-contact frames sit in sustained minority-band runs
(length ≥ 3, counted **within one contact stretch** — an isolated other-band delta is
indistinguishable from a genuinely dropped frame and charging it is correct, and runs never
concatenate across finger lifts). Only a minority band **slower** than the scored beat demotes; a
faster minority band never charges the scorer and is reported without refusing.

**Lost frame time share.** The headline drawing score: of all in-contact time, the fraction spent in
frames that ran late (gate: ≤ 1%). Notably rate-fair by construction — at 120 Hz each miss costs
half as much and there are twice as many opportunities, so the tolerated per-opportunity miss rate
is identical at both rates.

**Pair credit** (ADR-0136). A late rAF callback immediately followed by a short one, the pair
summing to two beats, is scheduler jitter around a steady display — not loss — and is not charged.
93% of a real iPad capture's "late" frames were such pairs; the do-nothing floor-control page paired
89 of 89. On Android, genuinely lost frames pair 0%, which is what makes the credit a signature
rather than an absolution. Presentation-side confirmation (a 240 fps camera on the glass) remains an
open one-time control.

**Paint latency.** Finger movement to the frame that showed the ink: P95 ≤ 20 ms, P99 ≤ 33 ms, max ≤
50 ms. Absolute milliseconds on purpose — a 50 ms hitch is perceptible at any refresh rate.

**Action gates.** For discrete taps (open a dialog, switch theme): first frame after the tap, frame
P95 during the transition (≤ 20 ms), and worst frame (≤ 33.5 ms, a breach counting only when two of
the three scored repeats show it — ADR-0156), against per-action documented allowances where earned.

**Idle frame control.** A "do nothing" cell proving the target can hold frames at rest; a mode whose
control fails has no action score attributable to the product (its cells are marked, not counted as
product failures).

**Trusted touch.** Input injected at the OS level (`isTrusted: true`) rather than fabricated as JS
`PointerEvent`s — the check exists because fake events skip the machinery that makes input expensive
and stayed perfectly smooth on a build where a real finger froze for 1.4 s.

**Cadence → density** *(recalibrated 2026-08-26)*. The "was the capture driven properly?" check.
Historically a rate floor (≥ 100 moves/s) with a ceiling (≤ 170, retired when a real hand measured
178–268 — ADR-0141). Now a **density floor: ≥ 0.9 contact moves per observed frame** (ADR-0145,
revised), because a rate encodes the display's speed — a 60 Hz-locked device driven perfectly can
never exceed ~60 moves/s at a flawless 1.0 moves/frame. Calibrated from both sides on both panel
speeds, all banked: the founding under-driven transport at 0.44–0.45 (120 Hz phone), the same
transport at **0.82 on every run** at 60 Hz (where its distortion is a per-run lottery no stream
statistic separates — one run fake-6.84%-lost at 0.11 ms/frame engine work, the next genuinely clean
at identical statistics), and a healthy floor of 0.96 across every tracked device, transport, and
hand. The companion **gap-p95 cap (≤ 25 ms** = 1.5 × the slowest supported beat) owns burstiness. CI
enumerates the whole healthy population and both negative-control corpora, so the calibration fails
toward re-derivation rather than silent erosion.

**Coalescing (`coalescedPerMove`)** *(retired as a check 2026-08-26, ADR-0144)*. When a finger
drags, the digitizer samples faster than events dispatch, and `getCoalescedEvents()` exposes the
batched samples. The probe records the **raw list length**, whose floor in a populated list is 1
(the event rides in its own list) — so the historical "1.05–1.08" meant *essentially no merging* and
"0" means *WebKit returned an empty list* (a spec deviation for trusted pointermove). The value
turned out to track **page delivery** (bundled vs remote), not input — through robots and a real
finger alike — so it is excluded from the verdict everywhere and kept as a recorded witness. The
recorded reopen condition: a bundled-delivery finger capture (via #1323's native bridge) disagreeing
with the bundled automation legs.

**Pressure / contact geometry.** Per-runtime fingerprint checks, demoted where measurement showed
the OS reports identical values for a robot and a finger ("a check that cannot tell a hand from a
robot is not a check" — ADR-0141). Still calibrated for iPad Safari/WKWebView; still uncalibrated
for the Android WebView (its hand-vs-synthetic corpus exists and can close it).

**Fidelity verdict vocabulary.** Per check: *pass*, *fail*, `uncalibrated` (the instrument has no
measured expectation — not a pass, and no recapture can fix it), `not-applicable` (measured and
found silent — excluded and named). A verdict failing only on uncalibrated checks marks a silent
instrument, not a bad capture. Acceptance and the matrix now judge by **one shared re-derivation
rule** (a stored verdict is the capture day's table; a stored pass with no measurements behind it
re-derives to failure).

**Eraser refill contract.** Eraser captures re-ink between passes so every pass erases real ink;
each refill's verification is recorded in the artifact, an anomalous or **missing-count** record
(expected = repeats − 1, owned by one production arming helper) refuses the capture, and the matrix
refuses the fold.

**Trust ledger** *(added 2026-08-26)*. Each published run carries a list — never a score — of its
trust dimensions in three states (verified / failed / unrecorded): input fidelity, refresh regime,
gesture repeats, gesture plan, eraser ink (where applicable), page identity, capture runtime, and
`hostQuiet` — deliberately present and permanently *unrecorded* until a host-quiet measurement
exists, so the one absent guarantee stays visible.

**Negative control.** A deliberately bad capture banked whole so a threshold has a measured bad side
("a number quoted in prose is not provenance"). Four exist: the founding 120 Hz under-driven
transport, the 60 Hz per-run-lottery pair, and the delivery-experiment corpora.

---

## Historical measurement grids

### 2a. Scoring metrics vs. the situations that broke them

✓ = handles the case correctly · ✗ = the case fooled it · — = not its job

| Situation                                             | Engine ms (marks) | Paint P95/99/max | Lost% (fixed 16.7) | Lost% (P10) | Lost% (dominant) | Lost% (dom + pair credit) | Deficit (contender) | Action gates | Idle control |
| ----------------------------------------------------- | ----------------- | ---------------- | ------------------ | ----------- | ---------------- | ------------------------- | ------------------- | ------------ | ------------ |
| Slow engine code (marked JS)                          | ✓                 | ✓                | ✓                  | ✓           | ✓                | ✓                         | ✓                   | —            | —            |
| Freeze in compositor / unmarked JS                    | ✗                 | ✓                | ✓                  | ✓           | ✓                | ✓                         | ✓                   | —            | —            |
| Genuinely dropped frames, steady display              | —                 | ✓                | ✓                  | ✓           | ✓                | ✓                         | ✓                   | —            | —            |
| 120 Hz screen (whole capture fast)                    | —                 | ✓                | ✗                  | ✓           | ✓                | ✓                         | ✓                   | —            | —            |
| Variable refresh: 120↔60 mid-capture (out of contact) | —                 | ✓                | ✗                  | ✗           | ✓                | ✓                         | ✓                   | —            | —            |
| Sustained regime mixing **in contact**                | —                 | ✓                | ✗                  | ✗           | ✗                | ✗                         | ✗                   | —            | —            |
| iPad rAF jitter pairs (late+short, no loss)           | —                 | ✓                | ✗                  | ✗           | ✗                | ✓                         | ✓                   | —            | —            |
| Slow dialog open / theme switch                       | ✗                 | —                | —                  | —           | —                | —                         | —                   | ✓            | —            |
| Device can't hold frames at rest                      | —                 | —                | ✗                  | ✗           | ✗                | ✗                         | ✗                   | ✗            | ✓            |

*The in-contact mixing row is why the mixed-regime **refusal** exists (grid 2b): no charging variant
scores a mixed capture correctly, so the capture is refused rather than mis-scored. Segment-wise
beat scoring is the known next rung if a boosted-mode (120 Hz iPad) row is ever wanted.*

### 2b. Validity gates vs. bad-capture situations — retired harness

| Situation                                                      | Trusted touch | Density floor (≥ 0.9 mpf) | Gap p95 (≤ 25 ms) | Regime declared + matched | Mixed-regime refusal |
| -------------------------------------------------------------- | ------------- | ------------------------- | ----------------- | ------------------------- | -------------------- |
| Synthetic JS events (fake input)                               | ✓             | —                         | —                 | —                         | —                    |
| Founding under-driven robot (0.44 mpf @120 Hz)                 | ✗             | ✓                         | ✓                 | —                         | —                    |
| Same transport at 60 Hz (0.82 mpf, per-run-lottery distortion) | ✗             | ✓                         | ✗ (p95 22 passes) | —                         | —                    |
| Real fast hand (178–268 moves/s)                               | ✓             | ✓                         | ✓                 | ✓                         | ✓                    |
| Healthy 60 Hz-locked input (emulator, desktop WebKit)          | ✓             | ✓                         | ✓                 | ✓                         | ✓                    |
| Bursty stream (fine average, stalls)                           | ✓             | ✗                         | ✓                 | —                         | —                    |
| Whole capture at the wrong regime                              | ✓             | ✓                         | ✓                 | ✓ (refuses)               | —                    |
| Sustained mid-contact regime mixing                            | ✓             | ✓                         | ✓                 | ✗                         | ✓ (slower-band only) |
| Robot indistinguishable from finger                            | ✓             | —                         | —                 | —                         | —                    |

*Retired columns, kept as history: the **rate floor** (rejected healthy 60 Hz-locked devices — the
mirror of the ceiling), the **cadence ceiling** (rejected a real hand), and per-runtime
**coalescing** (tracked page delivery, not input; the recorded value never measured merging).
Defense-in-depth beyond the grid: the 60 Hz-lottery transport is also **unplanned** — the emulator's
drawing rides the split transport, so no campaign drives the banned path; page identity, build
freshness, instrument fingerprints, and the gesture-repeat/plan/refill contracts guard provenance
rather than input.*

---
