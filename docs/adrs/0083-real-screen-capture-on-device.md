# ADR-0083: Measure the Real Screen on Device as a Separate Instrument (`perf:ipad:frames`)

**Status:** Active **Date:** 2026-07

## Context

ADR-0079 automated the device gates run. On iPadOS 26.5 it reports every ADR-0066 column at ≤ 2 ms
and clears every gate with wide margin — and on the same device, in the same session, the real app
at `/` visibly freezes mid-stroke. Both readings are correct, which means the instrument could not
see the problem at all.

The reason is structural rather than a tuning miss. `perf:ipad` drives `/dev/engine`: a bare canvas
with no line-art overlay, no `PointerHalos`, and no per-stroke Svelte reactivity, measured through
`engine.*` `performance.measure` spans. The real screen additionally pays for a `mix-blend-mode`
line-art plate, per-move DOM writes, per-stroke reactivity, and the real paper geometry — and every
one of those is compositor/paint or unmarked-JS work. They make the device slower **without making
any `engine.*` measure larger**. Measured on the real screen afterwards: 0–5 ms of marked engine
work inside a **1422 ms** frame.

Alternatives considered:

* **Widen the gates run** — add the missing costs to `/dev/engine`, or point the existing driver at
  `/`. Rejected: the driver dispatches a whole stroke inside one blocking tick (`E.strokeSync`),
  which `analyze-webinspector.mjs` already warns makes frame durations meaningless. A frame-pacing
  question cannot be answered by an instrument that destroys frame pacing, and the gates' own job —
  per-op cost at real op volume — is better served by keeping it synchronous.
* **Rely on the Web Inspector Timeline** (ADR-0079's manual path). It is the definitive compositor
  instrument and stays documented for that, but it is a hand recording per data point, exports ~115
  MB, and cannot be swept across A/B conditions.
* **Reuse `ipad-recorder.js` + `perf:replay`** — real input, but replayed in headless Chromium on
  the Mac, which is the wrong compositor on the wrong hardware for a rendering-side question.

## Decision

A second device instrument, `npm run perf:ipad:frames`, sharing ADR-0079's transport
(`scripts/perf/ipad-session.mjs`, extracted from `ipad.mjs`) and nothing else. It opens `/`, injects
`scripts/perf/real-screen-probe.js`, and records frame pacing, input queue delay, paint latency,
`pointermove` delivery, the finger-lift path, and undo-history growth. Four structural choices:

**The probe records; Node computes.** The probe appends numeric rows (`frames`, `events`,
`measures`) and hands them back verbatim; every percentile, verdict and comparison lives in
`real-screen-stats.mjs`, unit-tested in `scripts/tests/perf-real-screen.test.mjs`. This is not
tidiness. Four metric definitions were wrong in the first device capture and all four were corrected
from the saved tables with no re-drawing — which is also why `perf:frames:analyze` exists as an
entry point. A capture outlives the maths that was current when it was taken.

**No frame budget is assumed.** Safari gives web content a **60 Hz** `requestAnimationFrame` beat on
a 120 Hz ProMotion iPad Pro (iPad13,8 / iPadOS 26.5) — measured at 16–17 ms both idle and while
animating. A hard-coded 8.33 ms budget reported a perfectly-paced capture as 64% late frames, so
`observedFrameIntervalMs` derives the beat per capture from the p10 of observed deltas and every
threshold is a multiple of it.

**Hand-drawn is the fidelity reference; `--drive` is for attribution.** They are not substitutes. A
human draws differently every phase (7–45 strokes per phase in the first capture), so a hand-drawn
A/B produced non-monotonic suppression deltas and one finding that had to be withdrawn; repeat a
phase key (`page,page-no-halos,page,page-no-halos`) so variability cancels, and read the per-bucket
table, since a hand-drawn phase can only fairly be compared to *itself earlier*. Synthetic input
gives identical input per phase but cannot reproduce touch coalescing, ProMotion input pacing, or
queue delay — a constructed event's `timeStamp` is set when the probe builds it.

**One production seam, read-only.** `web/src/lib/boot/devHarnessSeam.ts` exposes the
already-exported `getUndoDebug()` on `/` behind the same gate as `routes/dev/*`
(`PUBLIC_ENABLE_DEV_HARNESS`, which the Netlify deploy never sets). It exposes no mutation
deliberately: a probe that can change the app can invalidate its own measurement. Everything else
the probe needs — loading a coloring page, selecting a brush, suppressing the blend nudge /
`mix-blend-mode` / halos — it gets by driving the real UI by selector or by injecting CSS with
`!important`, so production carries no probe-only surface.

Non-obvious invariants:

* The `nudge` suppression pins `.paper-view`'s computed transform, so the per-event `translateZ`
  epsilon no longer changes a computed value. The style write still happens; only the compositor
  damage goes. **A phase measured under it must not rotate the device** — the paper transform is
  frozen too.
* Contact is derived from the **move stream**, not only `pointerdown`: WebKit merges a tap-then-draw
  into one stream and drops the down (the case `penStreamQuirks.ts` adopts), and those strokes paint
  ink.
* Strokes are segmented over the whole recording and claimed by the phase their `pointerdown` fell
  in. A phase's clock runs while the finger is down, so it always ends mid-stroke; windowing events
  per phase first dropped the last stroke of every phase.
* Per-stroke figures are reported as **rates**, not percentiles. A phase holds 20–40 strokes, and a
  p95 over them is the second-worst sample dressed as a distribution — it made two otherwise
  identical runs disagree about a 100 ms-per-lift cost purely because one phase had 19 strokes and
  the next 27.
* The synthetic pump is a timer at the frame rate with bounded catch-up. `setTimeout(8.3)` delivers
  ~13 ms on device (nested-timer clamping), and a `MessageChannel` spin loop hits any rate while
  starving the event loop — which is the thing under measurement.

`perf:frames:local` runs the same probe and maths against `/` in Playwright at iPad Pro geometry, so
a baseline costs a command rather than a USB cable. Its findings are advisory: the costs at issue
are compositor-side, so a stall that reproduces locally is a cheap regression signal, while one that
does not reproduce says nothing about the device.

## Consequences

\+ A felt-lag report is now answerable with numbers on the surface users actually touch, instead of
with gates that pass comfortably. The first capture established that the lag is **render
starvation** — input handled every 8.3 ms with 6 ms queue delay while frames stop for 335–1422 ms —
which is neither slow JS nor lost input, and rules out the entire drawing engine as the cause.

\+ Two facts fell out that outlive the instrument: Safari's 60 Hz ceiling for web content (which
makes **ADR-0066's 8.3 ms commit-hitch gate stricter than the platform** on Safari/iPad), and that
input outruns frames 2–4×, so per-`pointermove` work runs several times per frame it can be shown
in.

\+ Saved captures are re-analyzable, so a metric bug costs an analysis pass rather than another
device session with a human hand.

− **Two device instruments now exist, and picking the wrong one wastes a session.** `perf:ipad`
answers "is an engine operation expensive"; `perf:ipad:frames` answers "did the screen keep up". The
runbook says so explicitly because the failure mode — reaching for the gates on a felt-lag report
and finding nothing — is exactly what motivated this ADR.

− The probe reaches into the app's DOM by selector and cannot import its constants. A rename would
leave a suppression reporting as applied while measuring nothing, so
`scripts/tests/perf-real-screen.test.mjs` drift-guards every selector against its component. That is
a test that exists to protect a tool, and it will need updating when the components change.

− rAF deltas measure when rAF *ran*, not when a pixel reached the glass. Safari exposes no
`longtask` entry type and no frame-timing API, so this is the best available proxy and must not be
read as "long tasks" — the first capture's stalls contain almost no JS at all.

− Synthetic input reproduced none of the reported lag on device (clean at 4.03 moves/frame with
`pointerType: pen`, and across a four-minute soak), so this class of problem still cannot close its
loop unattended. The required hand-drawn Timeline later attributed the stalls to compositing after
stroke commit: snapshot readback caused the per-commit spike, and the continuous cost scaled with
canvas pixel area rather than the optional layers. ADR-0015 carries the resulting 1.5× render-scale
cap.
