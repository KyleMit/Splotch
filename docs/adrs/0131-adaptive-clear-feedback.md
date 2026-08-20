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

## Amendment (2026-08): the ladder, the silent armed state, and the page turn

The decision above survives — procedural, distance-driven drag feedback plus one recorded clip at
the single fixed moment of commit. Three things inside it were replaced after the candidates were
built and auditioned side by side in
[`scrapbook/sound-design/clear-sound-contact-sheet`](../../scrapbook/sound-design/clear-sound-contact-sheet/index.html),
which holds every option, its design notes, and the clips.

**Pitch is quantized, not continuous.** Each note snaps to a degree of a major pentatonic scale
instead of gliding exponentially between two endpoints. A glide lands adjacent dots a few cents
apart, which reads as wobble; a scale makes every dot consonant with the one before it, so pulling
plays a rising melody and pulling back plays it in reverse. The bubble also chirps upward across its
own envelope, the way a real bubble's resonance climbs as it collapses, with a bandpassed droplet
tick on the attack.

**The armed state gained no sound of its own, and the ready-state pulse is gone.** Two findings from
the audition, in the order they were learned:

* A sound that *starts* at the threshold and then stops reads as "done" — the gesture announcing a
  result it has not produced yet. This ruled out the whole event-at-the-boundary family (a bell, a
  chime, a lone ring-out), not just particular clips.
* A sustained bed under the hold — a held chord, a breathing chord, a slow bloom — is too much noise
  for a drawing app aimed at two-year-olds, however quiet it is made.

What remains is the model the app already uses for the pencil: **the sound tracks the hand, and
resting is quiet.** Nothing fires when the drag arms; the ladder simply keeps climbing while the
hand keeps pulling.

That reverses this ADR's original rejection of "silence after the threshold". The rejection assumed
silence meant *nothing left to say*, and under the original mapping it did: the ladder spent ten of
its thirteen notes before the threshold and stopped dead at 1.4× it, so a held or continuing drag
really did fall into a dead app. The approach and the climb are now sized separately — nine notes up
to the threshold and nine more past it, out to 2.6× the commit distance, further than a thumb
travels — so continuing to pull always has somewhere to go. Silence is now specifically the sound of
a hand that has stopped moving, which is the same bargain the pencil-scratch loop makes and which no
child has to be taught.

**Cancel is no longer silent.** Releasing short of the threshold walks three notes back down the
scale. Nothing in the original build told a child their drawing had survived.

**The commit clip is `clear-page-turn.mp3`,** a recorded single sheet turning, replacing
`clear-pop.mp3`. The gesture's actual outcome is a fresh page, and the page turn is the sound of
that; the pop confirmed an event without describing it. Bubble level was also raised to match
`BASE_SCRATCH_GAIN` — the drag previously sat near a sixth of the app's own pencil sound, which a
tablet speaker in a noisy room loses entirely.

**What the tests must hold, beyond the original list.** `clearSound.test.ts` pins that notes keep
arriving while the drag continues past the threshold, that holding still produces nothing, and that
the reset a new gesture performs is silent — so starting a drag never sounds like abandoning one.
The first of those is not redundant: an audit that only listened to a held drag passed the broken
mapping, because the treatment promised silence when still and delivered it while also delivering
silence when moving.

**Consequences that changed.** The drag still has no standalone asset to swap, and every audible
note still creates an oscillator/gain pair — now with a bandpassed noise source for the droplet, and
still bounded by the note gate and short envelopes. Both were already accepted above. What is no
longer true is the ready-state bullet: there is no interval timer in the clear path at all, so a
held gesture schedules nothing.
