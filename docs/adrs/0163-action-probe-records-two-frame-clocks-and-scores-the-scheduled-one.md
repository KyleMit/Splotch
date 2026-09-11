# ADR-0163: The Action Probe Records Two Frame Clocks and Scores the Scheduled One

**Status:** Active — complements
[ADR-0162](0162-measured-p95-allowance-for-the-android-web-theme-flip.md) and
[ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md) **Date:** 2026-09

> **Amendment (2026-09, issue #1713): the probe retains the onset rows.** Every sample `finish()`
> returns carries two rows beside `postActionFrames`, each in the same shape as a `postActionFrames`
> entry with both clocks: `lastPreActionFrame`, the last frame whose scheduled stamp precedes the
> action, and `firstActionFrame`, the first frame stamped at or after it — the frame `firstFrameMs`
> reads. Each is `null` — present, never omitted — when no such frame exists. No scoring rule reads
> either: `scoredActionFrames` still iterates `postActionFrames` alone, every per-action field is
> computed from the frames it was before, and the legacy ledger in
> `tools/perf/tests/action-frame-stamps.test.mjs` passes unchanged. They are not a new frame-stamp
> epoch, because an epoch names what the scored table carries and which rule scores it; the keys'
> presence is what marks a capture that can carry the rows. Captures made before this amendment,
> dual-channel ones included, have neither row, and nothing recovers the boundary row from them.
> Section 5, the onset consequence, and the first and third notes are written against the retained
> rows.

## Context

`tools/perf/probes/action-probe.js` records one row per `requestAnimationFrame` callback and stamps
it with the callback's timestamp argument. Chrome hands a main-thread frame the vsync time of the
`BeginFrame` that requested it, so that stamp is the time the frame was **scheduled** for, and a
callback that runs late keeps its on-time stamp. Every action gate — the 20 ms post-action P95, the
33.5 ms max, the 33.5 ms first frame, and every allowance in ADR-0160 and ADR-0162 — scores
differences between those stamps.

Issue #1696's attribution of the Android compact-shell Night Mode toggle measured what that costs
(`docs/scratchpad/perf/2026-09-06-issue-1696-night-toggle-attribution.md`, paired Chrome trace at
f42d0994b27979731c8acc215e6e1f2385b85955). In all eight traced repeats the click's rAF-aligned input
task ran 26–39 ms on `CrRendererMain` and the compositor logged a `DroppedFrame` at the first
`BeginFrame` after the click, yet the probe reported clean 16.7 ms gaps in six of the eight; it read
33.4 only when the request itself slipped a whole additional vsync. The same clean product scored
33.4 / 33.4 / 33.4 and, an hour later, 16.8 / 33.4 / 16.8. On this probe **a two-beat red is
faithful, and a green is not proof the frame fit** — greens systematically under-report main-thread
overruns that stay inside the scheduled slot's slip tolerance.

Issue #1704 put the stamp semantics to the owner as a decision rather than a fix, because changing
the stamp source re-baselines every historical action capture and every gate calibrated against the
current semantics — a silent change would make new captures incomparable with the committed evidence
corpus. The options weighed:

1. **Stamp with actual callback time, or record both and score on actual.** Truthful about the main
   thread, but it re-derives every gate calibration, marks a scoring epoch in the artifact, and
   trades one bias for another (below).
2. **Record both timestamps; keep scoring on the scheduled stamp; let attribution read the actual
   channel.** The cheapest honest option: no re-baseline, and the instrument starts accumulating the
   evidence that would justify option 1 if it is ever warranted. **Chosen** — the owner accepted it
   on 2026-09-07.
3. **Keep as-is, documented.** Already partly done in `docs/PROFILING-CAMPAIGNS.md`, but it leaves
   the green-is-not-proof gap in every future capture with no way to size it.

## Decision

### 1. Every frame carries both clocks

The probe reads `performance.now()` once at callback entry and stores it in the row the frame
already allocates, beside the rAF stamp — one extra clock read per frame, no new allocation, and
nothing else on the frame path changes. `finish()` exposes the second clock on each
`postActionFrames` entry as two fields relative to the action:

| Field             | Clock                                          | Meaning                                                                                                             |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `endFromActionMs` | rAF timestamp (scheduled)                      | The vsync this frame was scheduled for. **Scored**, unchanged.                                                      |
| `gapMs`           | rAF timestamp (scheduled)                      | Scheduled-stamp difference from the previous frame. **Scored**, unchanged.                                          |
| `ranFromActionMs` | `performance.now()` at callback entry (actual) | When the main thread actually ran this frame's callback. Attribution only.                                          |
| `actualGapMs`     | `performance.now()` at callback entry (actual) | Callback-to-callback interval — the gap a blocked main thread cannot hide under an on-time stamp. Attribution only. |

`ranFromActionMs − endFromActionMs` is how late the callback ran against its vsync: near zero on a
clean main thread, most of a period in the #1696 shape.

### 2. The artifact says which epoch produced it

`tools/perf/lib/frame-stamps.mjs` owns the vocabulary: epoch **1** is scheduled-only (every capture
committed before this record), epoch **2** is dual-channel. The probe declares the epoch on
`window.__actionProbe.frameStampEpoch` and on every sample `finish()` returns; each action runner —
desktop Playwright, Android CDP, and Appium — writes `frameStampEpoch` into its artifact, derived
from the samples it wrote so the marker can never disagree with the data beside it, and
`artifactFrameStampEpoch()` reads a legacy artifact as epoch 1. A capture whose samples mix epochs
is refused: one capture is one instrument, and the campaign's instrument fingerprint
(`tools/perf/lib/instrument-fingerprint.mjs`, which already hashes the probe) is what stops a
resumed campaign from mixing the two.

Legacy captures are not reinterpreted. They carry no actual channel, they score exactly as they did,
and their summaries keep the exact shape they had — `tools/perf/tests/action-frame-stamps.test.mjs`
holds every committed action capture in `perf-profiles/evidence/` to a byte-identical re-derivation
under its own recorded calibration, against a ledger generated by the scorer as it stood at
d0e5b30c2ccde527614e275d72497229ef6858a7, before the channel existed.

### 3. Scoring stays on the scheduled channel; the report exposes the divergence

`summarizeActionGroup` in `tools/perf/lib/action-stats.mjs` never reads `actualGapMs` or
`ranFromActionMs`. Frame selection (`scoredActionFrames`) reads `gapMs` alone, so which frames are
scored is the same on both epochs, and the verdict path — `firstFrame`, `frames`, `passed` — is
untouched; a test substitutes absurd actual values into a clean sample and asserts every gated
figure is identical.

Beside those figures, a dual-channel group gains one informational `frameStamps` object, computed by
`frameStampDivergence()` over exactly the frames the gate scored:

| Field                      | Meaning                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `frames`                   | Scored frames carrying both clocks                                                                                                          |
| `actual.p50/p95/max`       | The callback-to-callback distribution over those frames                                                                                     |
| `p95DeltaMs`, `maxDeltaMs` | Actual minus scheduled, same frames — zero on a clean run                                                                                   |
| `callbackDelay.p95/max`    | How late callbacks ran against their vsync                                                                                                  |
| `hiddenOverruns`           | Frames the scheduled stamp keeps under the group's max gate (allowance included) while the actual gap crossed it — the #1696 shape, counted |

The console table every runner prints gains `actual p95` and `hidden overruns` columns (`n/a` for a
legacy capture). A legacy group carries no `frameStamps` key at all. The matrix generator's
`data.json` and rendered cells are unchanged: the figure lives in `actions.json`'s `summaries`, so a
campaign reads divergence without reprocessing raw samples, and nothing on a published page changes
meaning.

### 4. Why the scheduled channel keeps the gate

* **Its errors run one way.** A late callback keeps an on-time stamp, so the scheduled channel can
  read green when the frame overran; it cannot read red when the frame fit. For a release gate that
  is the correct asymmetry: a red is faithful evidence the product owes a frame, and a green is a
  claim to be checked against a trace — which is how ADR-0162 sized its allowance from the red
  readings and refused to count the greens as a fix.
* **Actual-callback time was not adopted for scoring** because it proxies main-thread scheduling,
  not presentation. Callback entry says when the renderer's main thread got to the frame; it does
  not say whether the compositor presented one — the `DroppedFrame` that mattered in #1696 is
  visible only in the trace. Scoring it would add dispatch-jitter false-reds in exactly the noise
  band the gates sit in: a callback that runs 2–4 ms late on one frame and on time the next reads as
  a 19–21 ms gap followed by a 13–15 ms one, and the 20 ms P95 gate would count the first. That
  trades a green-soft channel for a red-noisy one, and a noisy red on a release-gate row costs rig
  time on every activation (ADR-0158).
* **Both channels are wrong in different places**, and the dual corpus is the only thing that can
  say how often each is wrong. Choosing now, before that corpus exists, would be a guess dressed as
  a decision.

### 5. The reconsideration condition, and what a cutover would cost

The dual channel exists to accumulate the divergence distribution. **Reconsider scoring when the
accumulated `frameStamps` figures show scheduled-green / actual-red divergence that is common and
systematic** — hidden overruns recurring on the same cell across captures, the shape #1696 traced,
rather than appearing once in one capture — on a release-gate row. Isolated hidden overruns are the
dispatch jitter the second bullet above describes and are not the condition.

If that condition is met, a cutover **over the retained frame population** is cheap because the dual
corpus is its own calibration mapping. Every dual-channel capture holds both readings of every frame
`finish()` retains — the frames scheduled at or after the action — so the before/after of a scoring
rule that re-reads those frames is a computation: `summarizeActionGroup` re-run with each frame's
`gapMs` read from `actualGapMs`, over the corpus, in the ledger shape `action-frame-stamps.test.mjs`
already produces, plus a new epoch value in `tools/perf/lib/frame-stamps.mjs` marking which rule
scored an artifact. Gates and allowances for that rule are re-derived from the actual distribution
of the captures already committed, not from a recapture campaign.

A capture made after the 2026-09 amendment carries the onset too, so a rule that re-selects frames
there is the same kind of computation. `lastPreActionFrame` holds the frame stamped before the
action — under rAF-aligned input, the frame that ran after the action and rendered it (the
straddling frame in the Notes below) — and `firstActionFrame` the frame `firstFrameMs` reads. Both
are whole rows, `visualEffectsActive` included, with both clocks, and with `postActionFrames` they
form one contiguous run; the one overlap is a capture with no preceding frame, where
`firstActionFrame` can be `postActionFrames[0]` itself. On a coarsened clock the onset's order is
uncertain within one clock quantum (the first note below), so such a rule must read both rows and
treat that band as unordered. A dual-channel capture made before the amendment lacks both rows: over
it an onset rule can recover the first-frame row's clocks from `postActionFrames[0]` (its stamp is
that entry's `startFromActionMs`, its callback time `ranFromActionMs − actualGapMs`) but not its
`visualEffectsActive` flag, and never the boundary row. Until a cutover, the actual channel is
attribution: read it from a red cell's `frameStamps` before spending a trace, and never from a green
as proof the frame fit.

### 6. What did not change

The 20 ms P95, the 33.5 ms max and first-frame gates, the ADR-0156 breach confirmation, the ADR-0160
and ADR-0162 allowance ledgers, and every capture-time verdict are exactly as they were. The
committed corpus is not re-scored or reinterpreted. Issues #1693, #1694, and #1695 are their own
decisions. The `topFrameGaps`, `frameGapsMs`, `settleFrameGapsMs`, and `postActionFrameGapsMs`
sample fields stay scheduled-only; the raw `postActionFrames` table is the one place the second
clock needs to live, and the scorer re-derives from it.

## Consequences

* \+ Every action capture from this record on carries the evidence the green-is-not-proof gap was
  missing, at one clock read per frame, and the report surfaces it per action without touching raw
  JSON.
* \+ Nothing re-baselines. Legacy captures score byte-for-byte as before, verdicts are unchanged on
  both epochs, and the corpus stays comparable across the change.
* \+ A future cutover, if the evidence ever calls for one, is a computation over data already
  committed plus an epoch bump — not a recapture campaign on a rig that is often released.
* − The gate still reads green on a frame the main thread overran. This record sizes that gap; it
  does not close it. ADR-0162's rule stands: a recapture that reads green under an allowance is not
  evidence the frame fit.
* − The actual channel brackets the main thread only. A dropped compositor frame under a callback
  that ran on time is invisible to both channels; the paired trace remains the attribution
  instrument (`docs/PROFILING-CAMPAIGNS.md`).
* − `frameStamps` still says nothing about the action's onset. The straddling frame — scheduled
  before the action, run after it — stays out of every scored frame, so a late first callback never
  reaches the figure, and a dual-channel green with zero hidden overruns has said nothing about that
  frame. Captures made after the 2026-09 amendment keep the frame's row, both clocks recorded, as
  `lastPreActionFrame` beside the first-frame row's `firstActionFrame`, so the late callback is on
  record for a reader or a later rule. Earlier captures filtered it out by its scheduled stamp
  before either actual field existed, and it is in no artifact of theirs.
* − Changing the probe changes the campaign instrument fingerprint, so a campaign resumed across
  this record refuses to mix banked cells with new ones until `--accept-instrument-change` says so
  deliberately. That is the guard working, not a regression.
* − The neutrality ledger pins the scorer's output on the committed corpus. A future scorer change
  that legitimately re-baselines the corpus must regenerate it (`vitest -u` on the tools suite) and
  carry the diff as its record — the same discipline `perf:rescore` imposes on the drawing gates.

## Notes: other stamping choices seen in the probe, unchanged

Recorded here so the next reader does not rediscover them; none is changed by this record, and the
2026-09 amendment changes what the first one retains, not what it scores.

* **The straddling frame is excluded from every per-action field, and retained beside them.**
  `finish()` selects post-action frames by scheduled start (`at − gap ≥ actionAt`). Under Chrome's
  rAF-aligned input the click handler runs inside the `BeginMainFrame` task whose rAF stamp precedes
  the click's `performance.now()`, so the very frame that renders the click's result can carry a
  stamp before `actionAt` and be excluded; `firstFrameMs` then reads the next vsync. The 2026-09
  amendment keeps that frame's row as `lastPreActionFrame`, and the row `firstFrameMs` reads as
  `firstActionFrame`, with both clocks, so a later rule can re-select them from a capture. A
  positive `ranFromActionMs` on the boundary row shows it ran after the action, but the converse
  does not hold on a coarsened clock: `actionAt` and the callback time are both `performance.now()`
  readings, so a callback that ran after the action can read zero, and a whole-millisecond rAF stamp
  equal to `actionAt` files the onset frame as `firstActionFrame` rather than `lastPreActionFrame`.
  Zero, or anything within the clock's quantum (the resolution note below), is order-ambiguous. No
  field is derived from either row and no scoring rule reads them. Changing the selection itself
  would re-baseline the first-frame gate, a scoring change that waits on section 5's condition, not
  a probe change.
* **Activities and frames are on different clocks.** `activities`, `canvasMutations`, and
  `armedEvents` stamp `performance.now()` (actual); frames stamp the rAF timestamp (scheduled).
  `scoredActionFrames` compares the two when it decides which frame an activity belongs to, so an
  activity inside a late callback can post-date its frame's scheduled end and reopen the settle
  window one frame later than it should. The effect only widens scoring, never narrows it.
* **The first frame is a scheduled figure too.** `firstFrameMs` subtracts `actionAt` (actual) from
  the first frame's rAF stamp (scheduled), so the first-frame gate shares the scored channel's
  optimism. The frame it reads is retained as `firstActionFrame`, so its actual counterpart is
  `firstActionFrame.ranFromActionMs`; a capture older than the 2026-09 amendment recovers it only as
  `postActionFrames[0].ranFromActionMs − postActionFrames[0].actualGapMs`. It is not
  `postActionFrames[0].ranFromActionMs`, which is the next frame's. No figure is derived from it
  here.
* **Resolution differs by engine.** Chrome's rAF stamp and `performance.now()` both resolve to 0.1
  ms; Safari's rAF stamp is whole milliseconds and its `performance.now()` is coarsened, so on the
  iPad rows `callbackDelay` is quantized to at least 1 ms. Fine for the two-beat question, not for
  sub-millisecond attribution.
* **The idle control stamps driver time.** `markExternalAction()` sets `actionAt` from the driver's
  call, so its first-frame reading measures the driver round trip plus the next vsync, which is why
  it is a control and not a gated action.
