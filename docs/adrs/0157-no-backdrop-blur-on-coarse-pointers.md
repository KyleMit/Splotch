# ADR-0157: The Coloring Picker's Backdrop Does Not Blur Under a Coarse Pointer

**Status:** Active — amends [ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md) **Date:**
2026-09

## Context

Nine `<dialog>`-based modals share `.modal-dialog::backdrop` in `web/src/app.css`: a 0.6 black dim
with `backdrop-filter: blur(4px)`. On the drawing route that backdrop sits over the 61-layer canvas
stack (16 live tiles, 32 crayon preview planes, the input surface, the paper) at 2× device pixels.
The blur had never been measured; the 2026-09-02 campaign prompt listed it as the one unverified
assumption behind the physical iPad's dialog costs.

The A/B was two builds identical except for the backdrop rule — arm A as shipped, arm B with both
`backdrop-filter` declarations removed and the dim raised to 0.7 for every modal — driven through
the same `perf:ios:xcuitest:actions` families (`settings,theme,coloring`) on the physical iPad
(iPad13,8, iPadOS 26.5, Safari, portrait light, one warm-up plus three scored repeats), and through
Playwright WebKit on the Mac with ten repeats as a screen.

| Action (physical iPad)     | blur on: pooled P95 / max, per-repeat max | blur off: pooled P95 / max, per-repeat max |
| -------------------------- | ----------------------------------------- | ------------------------------------------ |
| open Settings              | 21 / 24 — 24, 23, 23                      | 21 / 24 — 24, 24, 23                       |
| switch light theme to dark | 17 / 22                                   | 17 / 29                                    |
| switch dark theme to light | 17 / 23                                   | 17 / 23                                    |
| select coloring page       | 31 / 33 — 33, 25, 31                      | 18 / 32 — 17, 32, 18                       |
| clear coloring page        | 28 / 28 — 17, 28, 17                      | 17 / 18 — 17, 18, 17                       |

Read the per-repeat column, not only the pooled one: `select coloring page` improved in two repeats
and worsened in one, and `clear coloring page` improved in one repeat and was already at the frame
beat in the other two. The pooled P95 gain is real (31 → 18 and 28 → 17 ms) and the maxima moved the
same way, but three repeats do not show a change on every activation, and the campaign's first
write-up misread the pooled P95/P99/max triple as three repeats; the review caught it.
`open Settings` and the theme switches did not move, so the Settings 56 ms capture-environment max
allowance (ADR-0090's amendment) keeps its reopen condition. The Mac showed no difference on any
action (19 ms P95 everywhere).

The picker's page select and clear are the two actions where a dialog retires — its backdrop still
on screen and blurring the canvas stack — in the same frames the paper changes underneath it. No
other dialog does that, and no other dialog moved. A canonical full sweep of the shipped build
turned the portrait-light `select coloring page` cell green (per-repeat maxima 23, 17, 21 on `main`
→ 17, 17, 19) and left the other three modes' select at 21–26 ms, where the wide art's SVG raster
and the picker's retirement still meet.

Alternatives: **removing the blur from every modal under a coarse pointer** (the first shipped form)
was rejected on review because `pointer` describes the primary input device, not rendering cost, and
the evidence covers one dialog; **applying the blur only after `animationend`** so the fly-in runs
over a plain dim (the measured cost is at retirement, not fly-in); **reducing the radius** (the cost
is the readback, not the kernel); **removing the blur universally** (an appearance decision the
owner has not made, and the Mac rows show no cost).

The narrowed form (picker only, coarse pointer) was re-measured on the same iPad with the same
focused families before it shipped: `clear coloring page` 17 / 17 ms pooled P95 / max with
per-repeat maxima 17, 17, 17; `select coloring page` 21 / 22 with 22, 17, 21; `open Settings` 22 /
24 with 24, 24, 24 and the theme switches 17 / 20–22, all unchanged from the blur-on arm. The
picker's clear gain carries over in full and its select lands where the canonical sweeps of the
earlier form put it, one to two milliseconds over the P95 gate on the wide art's raster.

## Decision

Two rules replace the single shared backdrop, both in `web/src/app.css`:

* `@media (prefers-reduced-transparency: reduce)` — every `.modal-dialog::backdrop` becomes a plain
  0.7 dim, honoured for the reason a user sets it.
* `@media (pointer: coarse)` — only `.coloring-book-modal::backdrop` becomes a plain 0.7 dim. The
  scope is the dialog the measurement covers. The pointer clause is the owner's appearance choice,
  not a cost proxy: touch devices are where the picker was measured and where the retirement frame
  lands in front of a child, and the frosted look stays under a mouse, where the Mac rows show no
  cost. Every other dialog keeps its blur everywhere.

## Consequences

* \+ The coloring picker's retirement frames lose their measured blur cost on the physical iPad:
  pooled post-action P95 31 → 18 ms (select) and 28 → 17 ms (clear), with the maxima moving the same
  way in two of three and one of three repeats respectively.
* \+ A user who asked the OS for less transparency gets it in every modal.
* − The picker's backdrop on touch devices no longer frosts the paper; the deeper dim is the only
  separation, and the picker now looks different from the other eight modals there. The design
  skill's chrome table records the split so the two looks are not read as drift.
* − The evidence is one device, one mode, three scored repeats per arm, with the effect visible in
  some repeats and not others; the canonical recapture at this commit is the validation, and the
  landscape and dark modes inherit the decision rather than a measurement of their own. A future
  campaign that scopes the blur by measured rendering cost rather than pointer type supersedes the
  pointer clause.
