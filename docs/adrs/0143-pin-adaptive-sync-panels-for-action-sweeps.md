# ADR-0143: Pin adaptive-sync Android panels to 60Hz for action sweeps

**Status:** Active **Date:** 2026-08

## Context

The August 2026 performance campaign's physical-Android action sweeps failed a broad family of
Settings toggles, theme switches, and tool selections with an eerily uniform frame P95 of
**24.9–25.0ms** against the 20ms gate (issue 1251), with maxes quantized to 25.0/33.4/41.7ms. The
uniformity across unrelated actions — behind first-frame P95s of 3–16ms, i.e. instantaneous
responses — did not look like product cost, and issue 1251 explicitly asked for an ADR-0136-style
check before anyone optimized anything.

Two explanations fit the numbers, and only a hardware experiment separates them:

* **Real per-frame work**: post-toggle transition frames each cost ~17–25ms, presenting every third
  vsync at 120Hz.
* **Presentation quantization**: Chrome boosts the adaptive-sync panel (SM-G990U1: 120/60Hz modes)
  around touch; during the boost's decay the compositor presents on a stepped cadence — 25.0ms is
  exactly 3 × the 8.33ms 120Hz period — while the page's rAF-gap probe faithfully records gaps the
  gate then charges as dropped frames.

The discriminating experiment (2026-08-25): pin the panel to 60Hz
(`settings put system peak_refresh_rate/min_refresh_rate 60.0`) and rerun the same actions on the
same build. **Every action in the family passed — frame P95 16.7–16.8ms flat** with the same
instantaneous first frames. The sweep's own idle control had already shown the panel idling at a
clean 60Hz (16.7 flat, passing), so the 25ms cadence exists only in the post-touch boost window. The
work was never the cost; the boost-window presentation stepping was.

Alternatives considered:

* **Model the boost in the scorer** (charge gaps against the observed post-action cadence, or
  forgive integer multiples of the alternate refresh period): more faithful to what a user's display
  does, but it makes the gate's meaning device-conditional and unfalsifiable — any real ~25ms frame
  on a 120Hz panel becomes indistinguishable from a presentation step. Rejected.
* **Leave the charge and document the failures as known-wrong**: leaves ~16 permanently red action
  cells per mode on the phone, drowning real regressions. Rejected — the same reasoning that
  produced ADR-0136's re-baseline of the drawing charge.

## Decision

`tools/perf/android/capture-browser-actions.mjs` pins the panel to 60Hz for the duration of the
action sweep — `peak_refresh_rate` and `min_refresh_rate` are read, set to 60.0, and restored
(deleted when they were unset) in the same `finally` block that restores rotation settings. The
artifact records `refreshRatePinnedHz: 60`.

**Drawing captures are deliberately NOT pinned.** Their input-fidelity cadence expectations and the
target's `120hz` refresh regime (ADR-0136, `refresh-regime.mjs`) describe the boosted state a real
drawing finger produces, and pinning would invalidate both. The pin is scoped to the action sweep,
where measurement happens after touch ends — exactly the window the boost decay corrupts.

## Consequences

\+ The action gate on physical Android measures product work against a stable beat: the 1251 family
scores 16.7–16.8ms and passes, and a future regression to 25ms there would be a real one.

\+ Read-mutate-restore matches the tool's existing rotation-settings pattern, and a crashed sweep
restores via the same `finally`.

− Action cells no longer observe the boost-decay presentation the child's display actually performs;
a product bug visible only during 120Hz boost decay would be invisible to the sweep.

− The pin writes device settings, so an operator interrupting a sweep uncleanly (kill -9) can leave
a phone pinned at 60Hz — visible as `renderFrameRate 60` in `dumpsys display`, cleared by deleting
the two settings.

− Historical android action artifacts (pre-pin) are not comparable to pinned ones; the artifact
field `refreshRatePinnedHz` marks the boundary.
