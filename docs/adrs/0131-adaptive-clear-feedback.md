# ADR-0131: Adaptive Clear Feedback Uses Procedural Bubbles and a Recorded Commit Pop

**Status:** Active **Date:** 2026-08

## Context

Drag-to-clear can finish almost immediately or continue for an arbitrary distance while the child
holds the Clear Button past its commit threshold. A fixed-length crescendo recording cannot stay
aligned to both cases: a short file ends during a long drag, while a long file advances too slowly
for a quick one.

Several alternatives were auditioned in the running app:

* **One generated crescendo recording, pitch-shifted with drag progress.** Its authored timing still
  fought the variable gesture, and aggressive playback-rate changes read like a cartoon jump rather
  than rising effort.
* **One continuous synthesized oscillator.** This tracked position exactly but sounded harsh and
  exposed every pointer adjustment as an unpleasant glide.
* **Filtered noise or wind.** It supplied a length-independent bed but did not sound connected to a
  clear action.
* **Short roller-coaster ratchet ticks.** Discrete pitched samples worked mechanically, but the
  sharper theme was less friendly than rounded water bubbles.
* **Silence after the threshold.** This made the most consequential part of the gesture feel as if
  the app had stopped responding.

[ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) already retains Web Audio for drawing feedback
after `HTMLAudioElement` playback failed the measured WebKit interaction and input-fidelity gates.
The remaining decision is how clear feedback divides procedural and recorded sound within that
graph.

## Decision

Use **procedural, distance-driven bubble dots during the drag** and a **recorded pop on commit**.

`dragToClear.ts` passes raw normalized distance to `drawingSound.ts`; visual progress remains
clamped at the commit threshold while audio can continue rising beyond it. `drawingSound.ts` creates
brief sine-oscillator resonances whose frequency and gain follow distance. The pitch keeps rising
until 1.4 times the commit distance, then holds. Absolute progress change is deliberate: backing
toward the button produces descending bubbles, so sound continues to describe the gesture in both
directions.

Crossing the threshold starts a quieter bubble every 240 milliseconds at the current pitch. It
continues while held because post-threshold silence falsely signals inactivity; leaving the ready
zone, cancelling, or committing stops it. Each dot uses a short exponential gain envelope and
disconnects its oscillator and gain nodes when it ends.

The distinct commit event plays `static/sounds/clear-pop.mp3`, lazily fetched and decoded when the
gesture begins. Only `commitClearSound()` requests playback; every cancellation clears both the
active gesture and any unfulfilled pop request so a failed load cannot leak confirmation into a
later drag. Both paths respect the shared sound-enabled and volume settings, including volume zero,
which creates no inaudible oscillator graph.

The authored frequency, progress, interval, gain, and envelope choices remain named tuning constants
in `drawingSound.ts`. `clearSound.test.ts` pins bidirectional pitch mapping, the cap and ready-state
lifecycle, zero-volume behavior, failed-load isolation, delayed commit playback, and sound-disabled
behavior.

## Consequences

* \+ Drag feedback stays synchronized to gestures of any duration without stretching a recording.
* \+ Discrete resonances communicate both forward and backward movement without the harsh glide of a
  continuous oscillator.
* \+ The recorded pop has one fixed semantic moment, so its authored shape never has to track
  variable progress.
* \+ The design stays within the measured Web Audio architecture retained by ADR-0085.
* − The drag sound has no standalone asset to swap; changing its character requires tuning the
  oscillator and envelope constants in code and auditioning the real gesture.
* − Every audible dot creates a small oscillator/gain pair. The progress gate and short envelope
  bound that churn, and end handlers must continue disconnecting both nodes.
* − Exact timbre depends on browser Web Audio synthesis. Tests can verify scheduling and lifecycle,
  but a human audition remains the acceptance check for friendliness.
