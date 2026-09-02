# ADR-0157: Modal Backdrops Blur Only Under a Fine Pointer

**Status:** Active — amends [ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md) **Date:**
2026-09

## Context

Nine `<dialog>`-based modals share `.modal-dialog::backdrop` in `web/src/app.css`: a 0.6 black dim
with `backdrop-filter: blur(4px)`. On the drawing route that backdrop sits over the 61-layer canvas
stack (16 live tiles, 32 crayon preview planes, the input surface, the paper) at 2× device pixels,
and the fly-in animation scales the dialog from 5% while the backdrop is full-screen. The blur had
never been measured; the 2026-09-02 campaign prompt listed it as the one unverified assumption
behind the physical iPad's dialog costs.

The A/B was two builds identical except for the backdrop rule — arm A as shipped, arm B with both
`backdrop-filter` declarations removed and the dim raised to 0.7 — driven through the same
`perf:ios:xcuitest:actions` families (`settings,theme,coloring`) on the physical iPad (iPad13,8,
iPadOS 26.5, Safari, portrait light, one warm-up plus three scored repeats), and through Playwright
WebKit on the Mac with ten repeats as a screen.

| Action (physical iPad)     | blur on — post-action P95 / max (ms) | blur off             |
| -------------------------- | ------------------------------------ | -------------------- |
| open Settings              | 21 / 24                              | 21 / 24              |
| switch light theme to dark | 17 / 22                              | 17 / 29              |
| switch dark theme to light | 17 / 23                              | 17 / 23              |
| select coloring page       | 31 / 33 (31, 31, 33 per repeat)      | 18 / 32 (18, 18, 32) |
| clear coloring page        | 28 / 28 (28, 28, 28)                 | 17 / 18 (17, 17, 18) |

The Mac showed no difference on any action (19 ms P95 everywhere). `open Settings` did not move, so
its 56 ms capture-environment max allowance (ADR-0090's amendment) keeps its reopen condition. The
coloring picker's page select and clear moved on every repeat: those are the two actions where the
dialog retires — its backdrop still on screen and blurring the canvas stack — in the same frames the
paper changes underneath it. Readiness did not move outside the transport's ~95 ms polling
alternation on either arm.

Alternatives, in the order the campaign prompt set: applying the blur only after `animationend` so
the fly-in runs over a plain dim (rejected for now — the measured cost is at *retirement*, not
fly-in, and the blur would still be present while the paper changes); reducing the radius (rejected
— the cost is the readback, not the kernel).

## Decision

The backdrop keeps its blur under a fine pointer and drops it under
`@media (pointer: coarse), (prefers-reduced-transparency: reduce)`, where the dim deepens from 0.6
to 0.7 to keep the dialog's separation from the paper without the frosted layer (`web/src/app.css`,
the `.modal-dialog::backdrop` rules). Touch devices — every phone and tablet the app ships to — take
the plain dim; the Mac keeps the frosted look, and so do its matrix rows.
`prefers-reduced-transparency` is honoured for the same reason a user sets it.

## Consequences

* \+ The coloring picker's page select and clear lose a 10–14 ms post-action frame cost on the
  physical iPad, measured on every scored repeat of a paired A/B.
* \+ A user who asked the OS for less transparency gets it.
* − Modals on touch devices no longer frost the paper behind them; the deeper dim is the only
  separation. The design skill's chrome table records the split so the two looks are not read as
  drift.
* − The split is by pointer type, not by measured device cost: a coarse-pointer device with a
  compositor that could afford the blur loses it too.
* − The measurement is one mode (portrait light) on one device with three scored repeats per arm;
  the canonical full sweep and the matrix recapture at this commit are the validation, and the
  landscape and dark modes inherit the decision rather than a measurement of their own.
