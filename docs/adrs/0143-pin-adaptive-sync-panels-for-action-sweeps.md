# ADR-0143: Pin adaptive-sync Android panels to 60Hz for action sweeps

**Status:** Active (amends [ADR-0092](0092-direct-cdp-android-browser-action-profiling.md))
**Date:** 2026-08

## Context

The August 2026 performance campaign's physical-Android action sweeps failed a broad family of
Settings toggles, theme switches, and tool selections with an eerily uniform frame P95 of
**24.9–25.0ms** against the 20ms gate (issue 1251), with maxes quantized to 25.0/33.4/41.7ms. The
uniformity across unrelated actions — behind first-frame P95s of 3–16ms — did not look like product
cost, and issue 1251 explicitly asked for an
[ADR-0136](0136-browser-target-lost-frame-gate.md)-style check before anyone optimized anything.

A frame of real per-frame work `W` presents at `ceil(W/P) × P` for vsync period `P`. The
discriminating experiment (2026-08-25) pinned the panel to 60Hz (`settings put system
peak_refresh_rate/min_refresh_rate 60.0`) and reran the same actions on the same build: **every
action in the family passed at a flat 16.7–16.8ms**. The two observations are jointly inconsistent
with any real-work explanation: 25.0ms at 120Hz requires `W ∈ (16.7, 25.0]`, and that same band
would present at 33.4ms at 60Hz — not the observed 16.7. No single `W` explains both runs, so the
25.0 cadence cannot be quantized product work. What the experiment proves is that **the work fits
inside one 60Hz period** (`W ≤ 16.7ms`); the sweep's own idle control idling at a clean, passing
60Hz on the same device places the 25ms cadence squarely in the post-touch boost window. The precise
mechanism — panel boost-decay stepping, or Chrome throttling content to 40Hz post-touch — is
deliberately not asserted; the numbers pin the conclusion either way.

Alternatives considered:

* **Model the boost in the scorer** (charge gaps against the observed post-action cadence, or
  forgive integer multiples of the alternate refresh period): more faithful to what a user's display
  does, but it makes the gate's meaning device-conditional and unfalsifiable — any real ~25ms frame
  on a 120Hz panel becomes indistinguishable from a presentation step. Rejected.
* **Leave the charge and document the failures as known-wrong**: leaves ~16 permanently red action
  cells per mode on the phone, drowning real regressions. Rejected — the same reasoning that
  produced ADR-0136's re-baseline of the drawing charge.

**The pin is exactly gate-neutral for detection.** P95 gate 20ms: a cell fails at 120Hz iff it
presents ≥ 25.0 iff `W > 16.7`; at 60Hz iff it presents ≥ 33.4 iff `W > 16.7` — the identical
boundary. The max/first-frame gate at 33.5ms likewise fails iff `W > 33.3` in both regimes. Pinning
therefore costs the sweep no sensitivity to real work at all; the only loss is the one named in the
consequences.

## Decision

`tools/perf/android/capture-browser-actions.mjs` pins the panel to `PINNED_REFRESH_RATE_HZ` (60) for
the duration of the action sweep. The original `peak_refresh_rate` and `min_refresh_rate` values are
read before the `try` (a failed read throws before anything mutates); the writes happen as the first
statements **inside** the `try`, so the same `finally` that restores rotation settings always
restores these — writing outside the `try` opened a crash window where one setting was written and
the restore never armed. A non-numeric original (`'null'` from an unset key, an empty read) restores
by deleting the key (`refreshRateRestoreArgs`, unit-tested).

**The pin is verified, not trusted**: these are `@hide` `Settings.System` keys a device may accept
and ignore, so the tool reads the display's `renderFrameRate` back from `dumpsys display` and the
artifact records `refreshRatePin: { requestedHz, observedHz }` — the observation, not the intent. A
mismatch warns and continues: `android-emulator-web` runs this same tool (ADR-0092's hybrid
transport), and an emulator that ignores the pin still captures, with an artifact that says so.

**Drawing captures are deliberately NOT pinned.** Their input-fidelity cadence expectations and the
target's `120hz` refresh regime (ADR-0136, `refresh-regime.mjs`) describe the boosted state a real
drawing finger produces, and pinning would invalidate both. The pin is scoped to the action sweep,
where measurement happens after touch ends — exactly the window the boost decay corrupts. Action
artifacts carry no `summaries.intervalMs`, so a pinned sweep cannot trip the refresh-regime verdict.

## Consequences

\+ The action gate on physical Android measures product work against a stable beat with unchanged
detection boundaries: the 1251 family scores 16.7–16.8ms and passes, and a future regression past
one 60Hz period there fails in either regime.

\+ Read-outside/write-inside matches the rotation-settings pattern, and every interruption that
reaches the `finally` restores the panel.

− Interruptions that never reach the `finally` still leak the pin: Ctrl-C (the preview server's
SIGINT handler calls `process.exit`), any `fail()` reached inside the try (an unserved URL, a stale
build), and kill -9. A leaked pin caps the panel at 60Hz, which fails every later drawing cell on
the device as off-refresh-regime — the recovery is deleting `peak_refresh_rate` and
`min_refresh_rate` from `settings`, and `docs/PROFILING-CAMPAIGNS.md` carries the runbook entry.

− Action cells no longer observe the boost-decay presentation the child's display actually performs;
a product bug visible only during 120Hz boost decay is invisible to the sweep. The pinned idle
control also reads 16.7 unconditionally, so the boosted-vs-idle comparison that diagnosed issue 1251
is not available from pinned artifacts.

− At 60Hz the max gate's headroom narrows (work in `(16.7, 33.3]` presents at 33.33 against the 33.5
gate instead of 25.0), and half as many frames are sampled per action window.

− Historical android action artifacts (pre-pin) are not comparable to pinned ones; the raw
artifact's `refreshRatePin` field marks the boundary. The matrix's normalized rows do not carry the
field.
