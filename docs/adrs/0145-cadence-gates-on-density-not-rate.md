# ADR-0145: Cadence Gates on Density, Not Rate

**Status:** Accepted — amends [ADR-0139](0139-per-runtime-input-fidelity-expectations.md) and
[ADR-0141](0141-cadence-is-a-floor-and-silent-checks-are-named.md). **Date:** 2026-08

## Context

The cadence check's floor required 100 contact moves per second. It existed for a real defect: the
Appium Android browser transport drove the app at 46.8 moves/s, and `lostFrameTimeShare` priced the
gaps between sparse samples as dropped frames — the fake 10–31% reds the campaign opened on. The
floor was measured from both sides (rejected transports 46.8–61, slowest hand 117.5, ADR-0141) and
has never passed a bad capture.

It fails good ones. A rate encodes an assumption about how fast the *display* runs, and two healthy
capture classes physically cannot satisfy it:

* The Android emulator's input is frame-locked to its emulated 60 Hz display: the split transport
  delivers 64.7–65.2 moves/s at **1.09 moves per frame** — denser per frame than the physical-phone
  capture that passes (0.97).
* Desktop WebKit's synthesized input runs at exactly 60 moves/s, **1.0 moves per frame**, across all
  36 tracked `mac-safari` phases.

Both are driven perfectly — every frame receives input — and both fail a floor whose value describes
their panel, not their fidelity. This is the mirror image of the cadence ceiling ADR-0141 retired: a
threshold calibrated against hardware behavior rather than against the quantity it exists to
protect. The founding defect, meanwhile, measured **0.44 moves per frame** — and moves-per-frame
separates it from every healthy capture on disk (all ≥ 0.96) without any claim about refresh rate.

## Decision

`cadence` gates on **moves per observed frame**, floor 0.6, shared as one exported constant with
`classifyPhase`'s input-loss diagnostic so the gate and the report cannot disagree. The floor sits
between the measured bad side (0.44 — quoted from the campaign record and re-measured as the tracked
negative control in `perf-profiles/evidence/2026-08-25-underdriven-control/`) and the measured good
side (0.96, the sparsest of 169 tracked healthy phases).

There is **no rate fallback**. An earlier revision kept the rate floor as a legacy branch for
artifacts predating the `movesPerFrame` field; its adversarial review proved the branch had no
reachable beneficiary — every committed artifact carrying `movesPerSecond` also carries the field,
`summarizeRun` has written it unconditionally (0 when contact frames are absent, never undefined)
since before this gate existed, and the rescorer recomputes inputs from raw reports — so the only
input that could reach a rate fallback is a doctored block, exactly the field-omission dodge a
fail-closed gate must refuse. Absence of the field fails cadence. The rate is still required to be a
finite, nonzero measurement: a truncated phase can bank `movesPerSecond` 0 beside a plausible
density, and a density whose rate half is missing is not a measured stream.

The companion gap cap moves from 20 ms to a named **25 ms = 1.5 × the slowest supported beat** (60
Hz, 16.67 ms). The gap check owns burstiness — a stream whose average density is fine but which
stalls and catches up, which density alone cannot see — and 25 needs no knowledge of the capture's
regime: a p95 gap beyond 1.5 slow-beats means skipped input frames on any supported panel. The good
side is tracked (the healthy corpus tops out at 19 ms); the bad side is currently prose only — the
untracked founding capture was recorded at 40 ms, while the tracked negative control of the same
transport measures p95 21 / max 39, inside this cap and refused on density instead. So the gap cap
presently has no tracked bad-side member; a capture that fails it will be the first. The former 20
ms cap passed those healthy 19 ms phases by 1 ms of unstated luck; this states the margin.

## What the density floor leans on

* **The frame clock.** Moves per frame trusts the page's rAF observations; if rAF were throttled,
  density inflates. The refresh-regime check (targets declare their beat; off-regime captures are
  refused) owns that guard, which means the density floor protects a target only once its regime is
  declared. The sim/emulator targets bootstrap theirs from their first banked recapture
  (unestablished captures bank rather than discard).
* **The gap cap for burstiness.** A transport delivering ten moves in one frame and none for nine
  frames averages 1.0 moves per frame; its p95 gap fails. The cap is now load-bearing rather than
  redundant with the rate floor, which is why it gained a named derivation and both-sides
  calibration in the same change.

## Consequences

* The four simulator/emulator targets and 60 Hz-locked desktop input become scoreable on drawing —
  the practical unlock issue 1215 was blocked on.
* The negative side of the calibration now exists as a tracked, re-scorable capture instead of a
  number quoted in prose (the campaign's own provenance rule applied to its own founding defect).
* Two honest narrowings. The negative corpus is one transport family: a future bad transport that is
  bursty-but-dense would be caught by the gap cap alone, and one that is uniformly dense but wrong
  in some third way has no check waiting for it — the fidelity table's structure (measured,
  per-check, named exclusions) is the mechanism for adding one when evidence arrives. And the
  measured bad side is **panel-relative**: the founding transport's ~47 moves/s at steady ~20 ms
  gaps computes to 0.45 moves per frame on the 120 Hz phone but ~0.78 on a 60 Hz panel — above this
  floor. The position this ADR takes is that under-driving is relative to the display (on a 60 Hz
  panel that stream puts input in most frames, and the scoring distortion sparse input causes is
  correspondingly small), but that is asserted from the mechanism, not measured. The measurement
  that would close it is the same transport driven against a 60 Hz target with its lost-frame
  distortion read against the gate; until it exists, refusals of this transport family on 60 Hz
  targets rest on the gap cap and trusted-touch alone.
* The negative control's artifact directory and mode strings are stamped `ipad-xcuitest` by the
  capture harness although the session drove Android through a capabilities file — a pre-existing
  harness labeling bug, noted in the corpus index so the mislabel cannot read as provenance.
