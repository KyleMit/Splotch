# ADR-0170: Dialogs Play an Exit Before They Close

**Status:** Active **Date:** 2026-09

## Context

Every modal that goes through the `modalDialog` action flew in from its opening button over 480 ms
and then disappeared in a single frame. The close path hid the card before calling `close()` — a
content retirement (`visibility: hidden` on each content root) by default, or a compositor
retirement (`opacity: 0` on the dialog plus `inert` content) for the coloring picker and the color
picker — and closed it one painted frame later. The hiding existed so a closing dialog never flashed
stale content, and the compositor variant existed so the picker's retirement cost one composited
frame over the paper instead of a repaint (the measured cells in ADR-0160).

The 2026-09 motion audit (ticket A) flagged this as the most repeated hard cut in the app: every
color pick, every coloring page pick, every Settings dismissal. The options were:

* **Keep the one-frame retirement.** Cheapest, but the entrance promises a return trip it never
  makes.
* **Let the platform own the exit** with `@starting-style`, `transition-behavior: allow-discrete`
  and `overlay`. Declarative and the right end state, but above the Chrome 111 / Safari 16.4 floor
  (`docs/COMPATIBILITY.md`).
* **Play a CSS exit keyed on a class, and close when it finishes.** Works at the current floor and
  keeps every exit in `app.css` beside its entrance.

## Decision

The action plays an exit, then closes. In `web/src/lib/actions/modalDialog.svelte.ts`,
`closeAfterExit` makes the content roots `inert` with `pointer-events: none` (the card is still on
screen but must stop taking input), stamps the reduced-motion answer onto the dialog, and adds
`DIALOG_CLOSING_CLASS`. It then waits for the dialog's own animations to finish — a rejected
`finished` counts as finished — behind a guard of `EXIT_GUARD_FACTOR` times the longest declared
`endTime`, so a throttled frame can never strand a dialog that state already closed. Only then does
it call `close()`. A dialog with no running animation still waits one painted frame.

`web/src/app.css` owns the exits:

* `.modal-fly-in` dialogs fly back 70% of the way toward `--origin-x/y` while scaling to 0.4 and
  fading (`dialogFlyBack`, `--duration-exit` on `--ease-glide`).
* Any other `modalDialog` dialog sinks in place (`dialogSink`) at zero specificity, on the
  independent `scale` property so it composes with the card's own centering transform. A dialog that
  choreographs its own send-off — AiImageResult's polaroid — outranks it and keeps that send-off
  through the close.
* Under reduced motion both are a fade (`modalFadeIn` reversed), never `animation: none`: the action
  waits on the animation.

The `retirement: 'compositor'` option is removed. The exit is itself a compositor retirement — a
`transform` and `opacity` animation on the dialog layer, with the content left painted — so the
distinction it drew no longer exists. Content is still hidden once the dialog has closed, so a
reopen never shows the previous opening's content before the action restores it.

Reopening mid-exit removes the class, which swaps the exit back for the fly-in; the fly-in restarts
from its first frame. `waitForDialogRetirement` resolves on `close` and keeps polling while the
class is on an open dialog, so callers that swap the paper after the picker retires (ColoringBook's
page pick and clear) now wait for the exit and then change the paper.

## Consequences

* \+ Every dialog's close answers its entrance, from one class and two keyframe blocks.
* \+ Content stays visible and inert through the exit, so a pick's feedback (the tapped hexagon, the
  pressed page tile) remains on the card while it leaves.
* \+ The platform path (`@starting-style` + `overlay`) can replace `closeAfterExit` and
  `waitForDialogRetirement` once the floor reaches Chrome 117 / Safari 17.4 / Firefox 129.
* − A pick lands `--duration-exit` later: the coloring page and the color change wait for the card
  to leave. That is the intended sequence (the dialog leaves, then the page settles) but it is added
  latency.
* − The measured P95 allowances in ADR-0160 for `select coloring page` and `close Settings` were
  taken on the one-frame retirement. The exit keeps the backdrop (and, under a fine pointer, its
  blur) on screen for its duration; those cells need a physical-iPad recapture before the allowances
  are trusted again.
* − An Esc or Android back that the platform closes natively still skips the exit: the dialog is
  already out of the top layer before the action hears about it.
