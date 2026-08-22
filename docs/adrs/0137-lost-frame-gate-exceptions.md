# ADR-0137: Codify Lost-Frame Gate Exceptions, Not Per-Cell Budgets

**Status:** Accepted — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md);
depends on [ADR-0136](0136-browser-target-lost-frame-gate.md). **Date:** 2026-08

## Context

[ADR-0136](0136-browser-target-lost-frame-gate.md) removed the last instrument defect from
`lostFrameTimeShare`. What it left behind is one cell that fails on the product: crayon in Safari on
a physical iPad, at 1.23% of in-contact frame time against a 1% gate.

That number is the end of a long search, not the start of one. Thirteen implementations were built
and measured on the device, three samples each:

| Approach                                          | iPad crayon |
| ------------------------------------------------- | ----------: |
| Shipped build at the start of the campaign        |       2.11% |
| Merge crayon pointermoves like every other brush  |       2.11% |
| …plus counting the deposition checkpoint in moves |       1.85% |
| Five further deposition reshapings (n2–n6)        |  1.26–1.89% |
| **Mirror by blit, landed**                        |   **1.23%** |

Crayon is the one brush whose ops cannot be coalesced. Every other brush paints one shape per op, so
a frame's worth of pointermoves merges into a single path and the per-op cost disappears. Crayon
deposits wax through pattern-filled strokes whose texture is built per segment; merging a frame's
moves into one longer path paints a larger dirty region per `stroke()` call and made things *worse*,
not better — 1.57% to 2.11% when tried directly. The engine exempts crayon from merging for that
measured reason.

The remaining per-op work is already close to minimal. Wax tiles and the patterns built from them
are cached per (colour, pass) with a warm-up pump that spreads tile construction across frames, so
there is no per-op random generation left to hoist out — pre-generating a set of overlays and
cycling them deterministically is, in substance, what the shipped design already does.
Mirror-by-blit removed the last duplicated work by copying the op's own rect instead of re-running
the pattern fill to produce byte-identical pixels.

Two things follow. Crayon on this target costs more than the gate allows and further reduction needs
a different deposition model rather than another optimization. And a patterned stroke is inherently
more expensive than a solid one, which is a property of the brush, not a regression in it.

## Decision

Add a table of **exceptions** to the lost-frame gate, keyed `<targetId>:<brush>`, and hold
`ipad-device-web:crayon` to 1.4%. Every other cell keeps the single 1% gate.

The table is an exception list, not a budget list. A cell absent from it is scored at
`LOST_FRAME_TIME_SHARE_GATE`, so a passing grade never has to be spelled out anywhere and a target
or brush newly added to the matrix cannot arrive already exempt — it has to meet the standard gate
or be argued into the table. Past runs stay inferable from the matrix output, which prints every
cell's measured share whether or not it is excepted.

Each entry carries the reason and the measurement it was set from, and the generated matrix renders
the whole table under its acceptance-gate section, so a reader never has to infer an exemption from
a number that merely looks passing.

**Entries only ratchet down.** 1.4% is 1.23% plus the ±0.15 percentage-point run-to-run spread this
device shows at three samples — enough headroom that a re-measure of the same code does not flip the
verdict, and not a percentage point more. Raising an entry needs the same evidence as adding one:
device measurements, three samples, and the alternatives that were tried and rejected.

## Consequences

* \+ The gate stays a single number everywhere except where it is written down that it is not, with
  the reasoning attached to the exemption rather than to a commit message.
* \+ The exception is narrow. It names one brush on one target; crayon on Android physical, on both
  emulators, and on all three desktop browsers is still held to 1%, and iPad crayon in the native
  Capacitor WebView is too.
* \+ A crayon regression on the iPad is still caught. The cell has a budget rather than an
  exemption, and 1.4% against a measured 1.23% is roughly one run-to-run spread of slack.
* − The matrix can now report "pass" for a cell a reader would expect to fail against the headline
  gate. Rendering the table beside the gates is the mitigation, and it is the reason the table is
  rendered rather than only stored.
* − An exception is easier to add than a fix. The ratchet-down rule and the requirement to record
  rejected alternatives are the only things holding that line, and both are conventions rather than
  anything the tooling enforces.
* − Crayon's cost is now documented rather than solved. If the deposition model is ever reworked — a
  different texture representation, or ops that can coalesce — this entry should be re-measured and
  lowered or removed, and it is worth checking before assuming the 1.4% still reflects the code.
