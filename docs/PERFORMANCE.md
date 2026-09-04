# Splotch performance inventory

*A reference compiled from the 2026-08-25/26 campaign sessions and re-verified against `main` at
d905c9de (post-merge of stack #1365 and PR #1369). Three parts: the terminology the performance
system speaks, the measurement/validation grids, and the full inventory of product-code performance
mechanisms. Where history matters (a metric that was replaced, a check that was retired), the
history is kept and the current state is marked.*

---

## Part 1 — Terminology

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

## Part 2 — The measurement grids

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

### 2b. Validity gates vs. bad-capture situations — current state

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

## Part 3 — Product-code performance mechanisms

*The full sweep of `web/src` (two-agent fan-out, 2026-08-26), re-verified against `main` at
d905c9de: the only product-code change since the sweep is the coachmark fix, added below as
entry 87. Paths under `web/src/` unless noted.*

### I. Boot & first paint

1. **Prerendered home (SSG) + per-route render modes** — `/` ships as static HTML; server routes opt
   out individually. `routes/+layout.ts:1`. *ADR-0040*
2. **Pre-hydration state stamp** — inline `app.html` script reads localStorage before first paint
   and stamps `<html>` attrs/CSS vars (theme, orientation, drawer, brush…) so returning users paint
   correctly with zero hydration flash; explicitly never load-bearing for a new visitor.
   `app.html:95-183`, drift-guarded by `app.html.test.ts`. *ADR-0040, ADR-0076*
3. **Engine boots before hydration; components adopt it** — static side-effect import of
   `drawing/earlyBoot` makes the canvas accept strokes before hydration's ~375 ms long task;
   `DrawingCanvas` adopts the running engine. `routes/+page.svelte:2-7`, `engine.ts:1222-1244`.
   *ADR-0072, ADR-0004*
4. **All CSS inlined into the prerendered head** — `inlineStyleThreshold: Infinity` kills iPadOS
   FOUC. `svelte.config.js`. *commit f6157766*
5. **Build target = supported browser floor** — smaller output than lowest-common-denominator.
   `vite.config.ts` + `browserTargets.ts`, guarded by `browserFloor.test.ts`.
6. **Hover data-preloading** — `data-sveltekit-preload-data="hover"`. `app.html:187`.
7. **Instrumentation dead-code-eliminated** — `__PERF_MARKS__`/`__DEV_HARNESS__` compile to literal
   `false`; release scan rejects retained marks; dev work counters are null in production.
   `vite.config.ts`, `tiledRenderer.ts:75`. *ADR-0010, ADR-0032*

### II. The idle substrate

8. **`scheduleIdle()` with cooperative fallback** — wraps `requestIdleCallback`; on Safari (no rIC)
   approximates idleness (no pointer down, input quiet ≥ 300 ms, two consecutive rAFs within 25 ms)
   so deferred work never lands inside a frame a child is drawing through. Substrate for most
   deferrals below. `lib/idle.ts`. *commit 55eaff0e (PR #1124's physical-iPad idle gate)*

### III. Lazy mounting & bundle boundaries

9. **Boot-hidden overlay chunk + one-per-idle-slice mount pump** — eight boot-invisible dialogs in
   one lazy chunk imported at idle, mounted one per slice; SettingsModal handed over early so a tap
   can beat the queue. `lib/boot/bootHiddenOverlays.ts`, `components/overlayChunk.ts`. *ADR-0049*
10. **Settings wide pane: staged mount/present/prewarm** — open constructs only above-the-fold
    sections; the rest fills one per frame after the fly-in plus a breather frame; presentation
    staged separately from layout so the open flip paints zero sections (33→17 ms P95 on iPad);
    closed-state idle prewarm; close re-hides one per idle slice; watermark makes reopen free.
    `settings/WideShell.svelte`. *ADR-0049, issue #910*
11. **SettingsModal closed state is `visibility:hidden`, not `display:none`** — prewarm pays
    style/layout up front; `showModal()` pays nothing. `SettingsModal.svelte:264-347`. *ADR-0049*
12. **What's New blocks revealed one per rAF** — all-at-once measured 43–47 ms.
    `settings/WhatsNewSection.svelte:21-45`. *ADR-0061*
13. **Privacy page: idle parental gate, on-demand Settings modal** — lazy imports behind
    single-flight. `routes/privacy/`.
14. **Lazy ErrorScreen** — crash UI loads only when the boundary trips.
    `routes/+layout.svelte:33-39`.
15. **Save pipeline pinned off the startup bundle** — export compositor/screenshot/folder-save load
    at press time; memoized self-resetting import promise. Enforced by
    `web/tests/startup-bundle.spec.ts` scanning modulepreload chunks for minification-proof markers,
    with an anti-vacuity check. `ActionsPanel.svelte:64-330`. *issue #461*
16. **Deliberately duplicated code at that bundle boundary** — `saveFolder.svelte.ts` inlines the
    `showDirectoryPicker` predicate rather than importing it (one static edge would re-partition
    Rollup's chunks); drift-guarded by `saveFolder.svelte.test.ts`. Same reason
    `SCREENSHOT_BUTTON_ID` lives in `ui.svelte.ts`. *issue #461*
17. **Coloring-pack I/O off the startup path** — manager/stores dynamic-imported from idle.
    `lib/boot/coloringPacks.ts`. *ADR-0103*
18. **Lazy Capacitor plugins, tree-shaken from web** — memoized self-resetting dynamic imports
    behind literal `__IS_CAPACITOR__` (Preferences, Media, Device, ScreenOrientation, DeviceLock,
    pencil-eraser — the last also idle-deferred). `lib/nativePlugin.ts:25-38`. *ADR-0013, ADR-0010*
19. **Lazy `idb` package + memoized connection** — never in the boot bundle; the promise self-resets
    on rejection. `lib/idb.ts:15-48`.
20. **`createSingleFlight` / `createLatestRequest`** — overlapping async callers share one run; new
    submits abort superseded fetches. `lib/singleFlight.ts`, `lib/latestRequest.ts`.

### IV. Input hot path

21. **Coalesced pointer-event replay** — the engine replays `getCoalescedEvents()` samples so fast
    scribbles curve instead of chording. `drawing/engine.ts:990-1007`. *ADR-0004 lineage*
22. **Per-frame stroke raster queue** — pointermoves queue per pointer and rasterize once per frame
    as one merged op (digitizer outruns display, 1.9–4.2 moves/painted frame); sync `flushAll()` on
    lift. `drawing/strokeRasterQueue.ts`. *commit 087cd708*
23. **Per-runtime crayon op granularity** — per-move ops on Safari (pays per path length) vs
    per-frame merged in WKWebView (pays per op), branched at compile time.
    `strokeRasterQueue.ts:34-101`. *issue #1236, commit 12e1c0b1*
24. **Crayon merged-moves cap (backpressure)** — `CRAYON_MERGED_MOVES_CAP = 8` so a stall can't
    merge a bbox spanning tiles the ink never touches. *commit 12e1c0b1*
25. **Cached canvas rect** — the hot path maps through a cached rect + scales instead of
    `getBoundingClientRect()` per move (forced reflow); refreshed on resize/scroll/orientation.
    `drawing/canvasMeasure.ts`; also consumed by PointerHalos.
26. **Trailing resize rebuild (web and native)** — `handleResize()` refreshes the cached canvas rect
    immediately, then restarts the `RESIZE_SETTLE_MS` timer so backing wipe+repaint runs only after
    layout settles. `drawing/engine.ts`. *ADR-0089*
27. **Re-entry resync only when geometry moved** — visibility/resume compares viewport+angle before
    paying the wipe. `resyncOnReentry()` in `drawing/engine.ts`. *ADR-0132*
28. **No-allocation hot-path accessors** — non-cloning crayon parameter reads (runs 3×/op);
    repo-wide rule: per-pointermove code must not allocate (`.claude/rules/svelte.md`).
    `crayonBrush.ts:286-303`.
29. **PointerHalos: ring moves coalesced to once per rAF** — pending positions in plain non-`$state`
    records, latest wins; GPU-composited `translate3d`. `PointerHalos.svelte:74-121`. *commit
    a1e5a2fc*
30. **Shared layout store + 200 ms rotation settle hold** — one module-level listener set serves all
    consumers; orientation events defer viewport sync (improved the issue-977 iPad profile);
    per-field inset assignment avoids waking dependents on equal re-measures.
    `state/layout.svelte.ts`. *commit 04169415*
31. **Getter-function deriveds & deliberately untracked lets** — shared derived state recomputes per
    call instead of always-on reactive graphs; timers/latches/memos are plain `let`s.
    `state/appearance.svelte.ts` et al; policy in `web/src/CLAUDE.md`.

### V. Tiled canvas & compositing

32. **4×4 tiled live canvas; input canvas shrunk to a 1×1 px backing** — the visible paper is 16
    tile canvases (+32 crayon preview planes); the pointer-capturing canvas costs nothing to
    composite. `drawing/liveTiles.ts`, `tiledRenderer.ts`, `engine.ts:151`. *ADR-0085, ADR-0089*
33. **Per-op tile intersection culling** — only tiles a stroke's padded bbox touches pay render,
    allocation, and undo capture. `tiledGeometry.ts`, `tiledRenderer.ts:280-311`. *ADR-0085*
34. **Empty tiles absent from the compositor** — tiles start `hidden`, shown just before first
    paint; removed 40–50 ms of theme switches compositing 48 transparent canvases.
    `tiledRenderer.ts:269-278`. *ADR-0087*
35. **Lazy tile backing allocation + one-tile-per-frame migration** on blank-canvas resize.
    `tiledRenderer.ts:104-176`. *commits 846acd60, 657d87b3*
36. **Deferred hidden-tile clear (two presented frames)** — post-clear wipes never land in the
    gesture's frames. `tiledSurfaces.ts:259-266`. *ADR-0086*
37. **CSS-presented paper view + permanent `will-change: transform`** — rotation with ink never
    repaints tiles; one CSS matrix presents the locked paper; spec-enforced
    (`engine-rotation.spec.ts`). `LiveSurface.svelte`, `drawing/paperView.ts`. *ADR-0089*
38. **Crayon live preview via CSS blend compositing, zero readback** — two extra canvases per tile
    with `mix-blend-mode: darken` + opacity reproduce the subtractive stamp pixel-exactly; flush
    bakes identical pixels. `engine.ts:159-174`, `LiveSurface.svelte`. *ADR-0068, ADR-0065*
39. **Capped DPR (2×), fixed per session** — DPR-3 would cost 9× pixels for detail a finger can't
    use. `engine.ts:197-205`. *ADR-0015*

### VI. Undo / history

40. **Tiled dirty-region snapshot undo** — per touched tile, first-touch pre-mutation snapshot;
    dirty bounds unioned; `crop()` shrinks to the dirty rect at commit; undo is
    `clearRect + drawImage`. `tiledUndoPatches.ts`. *ADR-0086; lineage 0066/0069/0074*
41. **Byte-budgeted retention** — patch bytes bounded to 6 whole papers (min 2 commands), depth
    cap 20. `tiledRenderer.ts:54-58, 233-249`. *ADR-0086; lineage ADR-0082*
42. **Idle history fold** — commands beyond the undo window fold into raster base tiles, one per 1.5
    s tick, never while pointers are active. `tiledRenderer.ts:330-359`. *ADR-0085; keyframe lineage
    0033/0035*
43. **Progressive clear capture** — clear hides tiles instantly, captures one tile's snapshot per
    rAF; mutations settle affected tiles synchronously. `progressiveClearCapture.ts`. *ADR-0086
    amendment*
44. **Undo fast paths** — `wasEmpty` restores without repaint; the post-undo empty flag comes from
    the record, not a pixel scan; `repaintDeferredToRestore` stops the paper-restore resize
    repainting through the command being popped (the #1198 fix — 103→17 ms).
    `tiledRenderer.ts:425-474`, `engine.ts:377-389`.
45. **Magic-recode baseline/tail retention** — cloned base raster + folded vector tail let
    theme/page recodes rebuild folded magic ink without retaining full history.
    `tiledMagicRecode.ts`. *ADR-0121*

### VII. Empty-canvas detection

46. **Downscaled scratch-canvas scan** — a 0.25× copy on a persistent `willReadFrequently`
    singleton, ~16× fewer pixels, keeps main canvases GPU-backed. `drawing/emptyScan.ts`.
47. **Tile-level early exit** — hidden tiles skipped; short-circuits at the first inked tile.
    `tiledRenderer.ts:506-510`.
48. **Idle-deferred eraser empty scan** — the post-lift blank check (4.5–12.3 ms on Android vs 8.3
    ms frames) waits 400 ms idle since it only gates button enablement. `idleEmptyScan.ts`. *commit
    13ecc3a0*

### VIII. Crayon caches & warm-up

49. **Deterministic Float32Array tooth fields, idle-prebuilt** — per-texel wax texture fields built
    once from fixed seeds, front-loaded via `scheduleIdle`. `crayonBrush.ts:222-259`. *ADR-0065*
50. **LRU wax-tile cache** — colorized tiles per (color, pass), cap derived from palette size;
    eviction also resets the pattern WeakMap (the issue-167 custom-color leak).
    `crayonBrush.ts:346-451`.
51. **Deadline-bounded tile warm-up** — color/brush selection warms wax tiles 8 rows per rAF under a
    2 ms/frame budget; new color supersedes; a stroke that beats the warm builds synchronously.
    `crayonBrush.ts:349-535`. *commits 62b076cd, ac7a0f39, b98e25d0*
52. **Pattern caches + seedPhase memo** — CanvasPatterns per context then color+pass; a 1-entry memo
    skips re-hashing for the ~6 identical calls per frame. `crayonBrush.ts:537-596`. *commit
    cc00a8a7*
53. **Pass buffer with device-px dirty bounds** — stamp and clear touch only the pass's unioned
    dirty rect: "a flush stays proportional to the pass, not the canvas." `crayonPassBuffer.ts`.
    *ADR-0068*
54. **Mirror by blit, not repaint** — the preview plane copies the op rect from the buffer, halving
    pattern fills per op. `crayonPassBuffer.ts:249-272`. *commit ae674d71*
55. **Checkpoint at 64 pointermoves** — bounds live buffer memory; counted in moves, not merged ops,
    so frame-merging can't stretch a pass to double wax. `engine.ts:566-619`. *ADR-0085 trial 23*

### IX. Magic brush

56. **Offscreen sheet + per-context pattern cache** — one paper-sized reveal source; cached
    no-repeat patterns (chosen over per-op mask and flat sample, all three measured).
    `magicBrush.ts:89-116, 477-518`. *ADR-0043*
57. **Per-tile pattern sub-regions** — each tile's pattern sources only its own sheet rectangle.
    `magicBrush.ts:489-526`.
58. **Worker-side sheet rasterization** — fills/gradients rasterize in a worker OffscreenCanvas
    (fetch+decode off-thread), 15 s timeout, main-thread fallback. `magicSheetRasterClient.ts`,
    `magicSheet.worker.ts`. *ADR-0091, ADR-0110*
59. **Edge margins from source strips, never destination self-copy** — self-sampling the sheet
    triggered WebKit's full-surface flush (~100 ms of the 1.1 s theme freeze).
    `magicBrush.ts:254-415`. *ADR-0087 trials 12–13*
60. **Deferred sheet reallocation on resize**; **deferred color-sheet transfer** until line art
    decodes (network priority to what the child sees first, 15 s self-heal); **lazy gradient pool,
    held gradient**. `magicBrush.ts:461-468, 596-631`. *ADR-0087/0091/0121, ADR-0043*

### X. Export / screenshot

61. **On-demand export module + idle warm** — the compositor + ~226 ms paper-texture fetch pre-warm
    at idle so the first save doesn't stall. `engine.ts:1444-1476`, `exportDrawing.ts`. *issue #461*
62. **Frame-bound export: ImageBitmap capture + worker compose/encode** — no main-thread readback;
    tiles transfer to a worker OffscreenCanvas; PNG via `convertToBlob`; the polaroid preview is a
    worker-side downscale. `strokeSnapshot.ts`, `pngEncoder.worker.ts`, `tiledPngCompositor.ts`.
    *ADR-0088*
63. **Cached encoder-worker singleton** (15 s timeout, recreate on failure); **4 s screenshot
    cooldown** (MobileSafari surface reclamation) + concurrent-tap coalescing +
    snapshot-at-pointerdown; **1 s preview timeout**; **export scale floor 2× decoupled from live
    DPR**. `pngEncoder.ts`, `screenshotTiming.ts`, `exportScale.ts`. *ADR-0088 + amendments*

### XI. PWA / service worker / network caching

64. **Deferred, stroke-gated SW registration** — the first visit registers only after 3 committed
    strokes, then at idle; Save-Data skips entirely — precaching never saturates a slow connection
    during first strokes. `vite.config.ts`, `pwa/updates.ts`, `routes/+page.svelte:51-63`.
    *ADR-0022, issue #462*
65. **Precache scoped to shell + starter book; NetworkFirst navigations, 5 s timeout** — stalled
    loads fall back to cache instead of leaving a child waiting. `vite.config.ts` workbox block.
    *ADR-0022, ADR-0103*
66. **Canvas-empty / hidden-page update lifecycle** — a new SW activates silently only when versions
    match; reload fires only when hidden AND the canvas is blank; hourly/focus/visibility checks;
    one cache-bust attempt per version. `pwa/updates.ts:76-351`. *ADR-0022*
67. **Responsive-coloring SW route with canonical fallback**; **installed-pack CacheStorage-first
    route**; **`version.json` per build**; **no SW at all in native builds**.
    `pwa/coloringFallback.ts`, `pwa/coloringPackRoute.ts`. *ADR-0042/0045/0103/0022*
68. **CORS preflight cached 24 h** (`Access-Control-Max-Age`). `hooks.server.ts:28-39`. *ADR-0007*
69. **Netlify edge cache headers** — immutable year-long `_app/immutable`, week-long stable-filename
    media (rename-on-change contract), `no-store` on `sw.js`/`version.json`, edge-level 308s and
    static 404s that never invoke SSR. root `netlify.toml`. *ADR-0042, ADR-0022, ADR-0112*

### XII. Coloring packs & images

70. **Progressive background packs** — one starter book ships; the rest install book-by-book into
    versioned CacheStorage with per-file SHA-256 + byte verification, completion markers, old-cache
    deletion. `coloringPacks/`. *ADR-0103*
71. **Per-file idle gating + network-condition gating** — every pack file's fetch waits for idle;
    auto-downloads blocked on Save-Data/cellular/2g; pause/resume on online/visibility.
    `webStore.ts`, `manager.ts`. *ADR-0103*
72. **Capped shipped resolutions** — 1152 px max-edge fills, 240 px thumbs; responsive srcset tiers
    with canonical fallback; native skips srcset. `state/books.ts:58-124`. *ADR-0045, ADR-0103*
73. **Session-keyed image prefetch cache + cancellation** — detached `Image()` warms once per URL
    per session; picking a page aborts every other in-flight warm so the chosen page gets the
    bandwidth. `lib/imagePrefetch.ts`. *ADR-0045*
74. **Tiered warms** — cover thumbs at idle on open (re-run on theme change); a book's pages on tile
    press/hover; the *other orientation's* art at idle only after the picked page decodes.
    `ColoringBook.svelte:63-79`, `DrawingCanvas.svelte:231-251`. *ADR-0045*
75. **Decode-gated overlay swap** — new line art decodes off-DOM (`img.decode()`,
    `fetchPriority='high'`) and swaps by opacity only when ready; current art stays visible
    meanwhile. The displayed image keeps `decoding="async"` so WebKit can rasterize the decoded
    source at its paper-sized layout without blocking the selection frame. A 2026-09-04 physical
    iPad Safari A/B (one warm-up plus three scored repeats) reduced landscape-light P95/max from
    25/31 to 19/20 ms and landscape-dark from 29/30 to 19/21 ms; a preceding focused dark treatment
    scored 22/31 ms. `DrawingCanvas.svelte:195-229, 278-287`,
    `docs/scratchpad/perf/2026-09-04-issue-1569-async-overlay-decode.md`. *ADR-0087, commit
    2392ee40*
76. **`loading="lazy"`/`decoding="async"`** on grid tiles and AI imagery.

### XIII. Fonts, audio, storage

77. **Idle font warm-up, deliberately no preload** — the drawing route paints no text;
    `document.fonts.load()` in the background; a measured `<link rel=preload>` alternative was
    benchmarked and rejected. `routes/+layout.svelte:19-27`. *ADR-0075*
78. **Two-stage sound preload** — the first 119 KB pencil mp3 on the earliest boot path, other
    variants at idle; per-URL promise memos + failed-URL sets. `audio/drawingSound.ts:96-168`.
79. **Procedural clear-feedback audio** — synthesized resonances driven by drag distance instead of
    an asset (length-independent, nothing to load). *ADR-0131, ADR-0085*
80. **Dual-layer storage: sync reads, fire-and-forget native mirror** — all reads synchronous (no
    async flash at `$state` init); native writes mirror to Preferences un-awaited; **concurrent**
    durable hydration. `lib/storage.ts`. *ADR-0005*
81. **Persistent-storage request kept off the boot path** (would prompt Firefox at startup).
    `lib/idb.ts:4-13`. *ADR-0128*

### XIV. Cross-cutting

82. **`will-change`/`contain` promotions** on animated overlay layers (polaroid, confetti, dial,
    clear button, color sheet, paper views) — the LiveSurface one is test-enforced.
83. **rAF-throttled scrollspies + IntersectionObserver scroll cues** — no per-frame DOM measurement
    on privacy/design/changelog/Settings scrolling. `actions/scrollCue.ts`,
    `WideShell.svelte:428-440`. *issue #907*
84. **One shared AI-progress rAF loop** — a single detached loop serves dial + polaroid; cancels
    when settled. `state/aiProgress.svelte.ts`. *ADR-0116*
85. **Tile/worker context recovery** — `contextlost` recovery scheduled on rAF, probed cheaply on
    re-entry, repaint skipped when a resize will repaint anyway. `tiledContextRecovery.ts`.
    *ADR-0132, ADR-0110*
86. **WebP re-encode for AI uploads** — the PNG re-encoded to quality-tuned WebP (a fraction of the
    bytes for flat-color art); capability probed once per session. `drawing/aiImage.ts:38-84`.
87. **Coachmark animations scoped to visibility** *(new, PR #1369)* — the drag-to-clear tutorial's
    two infinite keyframe loops ran forever on their hidden base state (opacity/visibility don't
    pause CSS animations), taxing every frame of every session — 72% of all Animation style
    invalidations in an emulator trace. Now applied only under `.visible` (which also restarts them
    from frame 0 on reveal), with base `opacity: 0` so a mid-cycle dismissal vanishes in place, and
    reduced-motion overrides at matching specificity. Measured: 5,847 → 0 Animation invalidations;
    emulator theme-flip post-p95 median 100.1 → 66.7 ms (n=3/arm). `ClearCoachmark.svelte`, pinned
    by `clear-tutorial.spec.ts`.
88. **Action Drawer motion canceled before device rotation** — `orientationchange` clears an armed
    drawer transition before the viewport breakpoint flips, so a stale motion marker cannot animate
    the drawer's axis margins through the drawing's rotation frames. A physical Android Chrome
    canonical A/B removed all drawer transition events from both with-ink directions and reduced
    portrait-to-landscape P95/max from 33.4/66.7 to 16.7/16.8 ms. The reviewed implementation also
    handles the standard Screen Orientation signal and releases a marker that starts no transition;
    those post-capture hardenings await the final matrix recapture. `ActionsPanel.svelte`,
    `docs/scratchpad/perf/2026-09-04-issue-1632-rotation-drawer-motion.md`.

### Documented rejections — perf machinery deliberately absent

* `desynchronized: true` canvas contexts (the Android overlay composites opaque black) — *ADR-0051*
* Font `<link rel=preload>` (measured, no win) — *ADR-0075*
* Auto SW registration at load (replaced by the stroke gate) — *ADR-0022*
* Two resident theme images (the decoded-sibling gate instead) — *ADR-0087 trial 22*
* Theme-image/sheet-snapshot caching (measured, no improvement) — *ADR-0087 trials 14–16*
* Stroke simplification at commit (ADR-0036) — superseded outright by the tiled per-frame-op
  architecture.

### The shape of the whole

Almost everything funnels through four ideas: **do it per frame, not per event** (raster queue,
halos, section mounts, tile migration); **do it at idle, never while a finger is down** (the
`scheduleIdle` substrate under ~15 mechanisms); **touch only what changed** (tiles, dirty rects,
culling, the hidden-tile invariant); and **keep it off the startup bundle** (test-pinned
boundaries). The one anti-pattern this inventory's own sweep later caught — an infinite animation on
a hidden element — is the inverse of idea two, and its fix is entry 87.

### Known open performance work (as of 2026-08-26)

* **#1199, two remaining thirds**: the theme flip's multi-flush style-recalc cascade (several
  full-document recalcs per toggle; a ~10× cold-vs-warm per-element anomaly) and the blank-canvas
  live-tile churn on theme switch (hidden flips, backing reallocation, 1,268 layout insertions) —
  both trace-attributed on the issue.
* **#1322** — the campaign-end recapture and matrix regeneration, where the trust ledger, the
  recalibrated gates, and the eraser column's supersession all land in the published matrix.
* **#1632 / #1130** — device-bound rotation and Settings-frame cells; **#1344** — spread and
  repeat-count measurement; **#1304** — the host-quiet measurement behind the trust ledger's one
  permanently-unrecorded row.
