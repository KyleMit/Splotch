# ADR-0038: Cancel Stylus Touch Streams to Stop iPadOS Scribble Swallowing Quick Pen Strokes

**Status:** Active **Date:** 2026-07

## Context

On iPadOS Safari, an Apple Pencil stroke that starts within ~450ms of a pen *tap* (on a color
swatch, or even on the canvas itself) never appears on screen. Diagnosis with the schema-3 input
recorder (`scripts/perf/ipad-recorder.js`) and a Web Inspector timeline export proved how deep the
failure sits: the stroke's pointer events all arrive, the engine paints it into the backing store
(pixel probes show the alpha and it persists), the stroke commits to the undo log, and the ink is
present in WebKit's own composited frames — yet the glass never shows it, and it never appears
later. The culprit is **Scribble**, iPadOS's system-wide handwriting recognizer: a pen tap followed
quickly by a stroke looks like handwriting (dot-then-letter), so the system claims the stroke's
presentation. Finger input is immune (Scribble is pen-only), which is why the bug read as an "Apple
Pencil input bug" for so long.

Alternatives ruled out on-device via the `scripts/perf/ipad-experiments.js` console toggles:

* **`preventDefault()` on the pointer events** — the engine already cancels pointermoves; palette
  handlers cancel pointerdown/up. Scribble ignores all of it (also documented at
  [mikepk.com](https://mikepk.com/2020/10/iOS-safari-scribble-bug/)).
* **Removing tap-triggered visual effects** (selection-ring animation, transitions, focus shift) —
  no effect; the trigger is the tap itself, not anything the app does with it.
* **Forcing compositor commits** on the canvas after strokes (`nudgeCanvas`) — the lost frames stay
  lost; only re-damaging the pixels would reveal them, far too late for live drawing.
* **Asking users to disable Scribble in Settings** — works (confirmed), but is not an acceptable ask
  for a toddler app's parents.

The one working counter-measure, from the 2020 Scribble bug reports: cancel the **touch events**
Safari fires in parallel with pointer events for the Pencil. A non-passive `touchstart`/`touchmove`
listener calling `preventDefault()` makes Scribble release the stroke. Crucially, the *arming tap*
must be cancelled too, not just the stroke: guarding only the canvas fixed tap-on-canvas-then-draw
but not tap-on-swatch-then-draw.

## Decision

Two guards, scoped by what each surface can afford:

* **Canvas** (`web/src/lib/drawing/engine.ts`, `initDrawingCanvas`): non-passive
  `touchstart`/`touchmove` → `preventDefault()` for **all** touches. The canvas needs no click
  synthesis and already has `touch-action: none`, so cancelling everything is free.
* **Every tappable control near the canvas** (`web/src/lib/actions/scribbleGuard.ts`, applied via
  `use:scribbleGuard` in `ColorPalette.svelte`, `ColorPicker.svelte` — where the `<dialog>` guard
  also covers backdrop taps, since backdrop events target the dialog element — and
  `ActionsPanel.svelte`): non-passive `touchstart`/`touchmove`/`touchend` → `preventDefault()` only
  when every changed touch has `touchType === 'stylus'` (a Safari-only `Touch` field — see the
  `docs/COMPATIBILITY.md` risk register). Cancelling `touchstart` suppresses the synthesized
  `click`, so finger touches must pass through untouched: on non-iOS browsers `touchType` is
  `undefined` and the guard is inert.

Suppressing the stylus click synthesis means a guarded surface cannot rely on `click`. The palette
and picker were already pointerup-driven; ActionsPanel's buttons were click-driven and now activate
through the companion action `scribbleTap` (same file): pointerup gated on a matching pointerdown on
the same control (so an uncaptured drag that merely ends on a button doesn't fire it), with `click`
kept solely for keyboard/assistive-tech activation (`detail === 0`) and a real pointer's trailing
click ignored so nothing double-fires where the guard is inert. Any future control a pen can tap
right before drawing gets `use:scribbleGuard` on its surface and `use:scribbleTap` instead of
`onclick`.

Invariant: these listeners are **not** redundant with the pointer-event `preventDefault()` calls
next to them and must not be "simplified" away — cancelling pointer events does nothing to Scribble.
Non-passive registration is load-bearing.

## Consequences

* \+ The reported bug — first Pencil stroke after a color pick never renders — is fixed with
  Scribble left enabled, on the web app and (same WebKit) the iOS shell.
* \+ `scribbleGuard` is a reusable action: any pointer-driven control a pen taps right before
  drawing can adopt it with one `use:`; click-driven controls pair it with `scribbleTap`.
* − Pen taps on guarded controls lose iOS's tap-synthesized `:active` press feedback (the cancelled
  touchstart never arms it) — cosmetic, pen-only.
* \+ The diagnosis toolchain this produced (schema-3 recorder with pixel probes + engine marks,
  `ipad-experiments.js` toggles) is reusable for future device-only input bugs.
* − Scribble handwriting-to-text into the app is impossible on guarded surfaces — irrelevant here
  (there are no text inputs near the canvas), but a real constraint if one is ever added.
* − The stylus/finger split rests on Safari-only `Touch.touchType`; if WebKit ever drops or changes
  it, the palette guard silently stops working (the canvas guard, which carries most of the fix,
  does not depend on it).
* − Playwright/Chromium cannot construct stylus touches, so the discrimination logic and the
  `scribbleTap` activation/dedup rules are unit-tested (`scribbleGuard.test.ts`) while e2e covers
  only the canvas guard and the finger pass-through; full verification remains a manual on-device
  check.
