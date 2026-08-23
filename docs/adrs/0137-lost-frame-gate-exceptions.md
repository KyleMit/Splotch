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

**Every one of those implementations survives**, so a later attempt can read the diff rather than
rebuild it. Each rejected branch is pushed and has a closed pull request describing what it tried
and what it measured; the adopted ones are in the PR that shipped.

| Branch                                     | What it tried                             | Result             | Where          |
| ------------------------------------------ | ----------------------------------------- | ------------------ | -------------- |
| `exp/1196-c1-raf-coalesce`                 | Rasterize once per frame, not per event   | Android eraser fix | adopted, #1201 |
| `exp/1196-c7-mode-frame-beat`              | Beat from the dominant interval           | ADR-0134           | adopted, #1201 |
| `exp/1196-c8-idle-empty-scan`              | Eraser empty scan once the child stops    | adopted            | adopted, #1201 |
| `exp/1196-n1-mirror-by-blit`               | Crayon mirror by blit, not re-paint       | 1.23%              | adopted, #1201 |
| `exp/1196-c2-drop-permanent-promotion`     | Stop permanently promoting the paper view | no change          | #1205          |
| `exp/1196-c2-single-crayon-plane`          | Collapse crayon's two preview planes      | never implemented  | #1206          |
| `exp/1196-c3-quiet-halos`                  | No brush ring under a fingertip           | within spread      | #1204          |
| `exp/1196-c4-adaptive-grid`                | Live grid 4×4 → 3×3                       | worse on iPad      | #1207          |
| `exp/1196-c5-skip-redundant-crayon-mirror` | Skip the mirror over blank paper          | no gain            | #1208          |
| `exp/1196-n2-single-pass`                  | One density pass instead of two           | 1.89%              | #1209          |
| `exp/1196-n3-pattern-phase-cache`          | Skip re-transforming an unmoved phase     | 1.66%              | #1210          |
| `exp/1196-n4-bounded-anchor-scan`          | Bucket pass anchors to bound reentry      | 1.70%              | #1211          |
| `exp/1196-n5-no-mirror-blank`              | C5 re-measured after N1                   | 1.73%              | #1212          |
| `exp/1196-n6-no-darken-blend`              | No `darken` blend at all (diagnostic)     | 1.26%              | #1213          |

N6 is the one to read first. Turning the `darken` blend off is not shippable — it is what makes wax
look subtractive — and it only *matched* mirror-by-blit rather than beating it, which is the direct
evidence that the blend **mode** is not where the residual lives. It leaves the two preview planes
themselves untested; see below.

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

Two measurements narrow where the remaining cost is **not**, without locating it. `xcrun xctrace`
against the **native** build put crayon and pen within noise of each other on the GPU — **p50 1.50
ms against 1.53 ms** — so crayon is not GPU-*bound*; the top WebCore symbol in both was
`AXObjectCache::performDeferredCacheUpdate` (59 samples crayon, 72 pen), an XCUITest accessibility
artifact rather than drawing work. And N6 above swapped `mix-blend-mode: darken` for `normal` and
only matched mirror-by-blit, so the blend *mode* is not the dominant cost.

Be precise about what that does not establish. N6 left **both preview planes and all compositing in
place**, so it bounds the blend mode rather than the cost of compositing two planes per tile. The
xctrace run measured the native Capacitor WebView and only GPU p50, so it says nothing about
Safari's CPU-side layer or compositor scheduling — which is the target the gate actually governs.
And the candidate that would have tested this directly, collapsing crayon's two planes into one
(#1206), was branched and never implemented.

Two things follow. Crayon on this target costs more than the gate allows, and thirteen measured
attempts failed to close the gap — which is a reason to stop paying for more attempts now, not a
proof that the cost is irreducible. And a patterned stroke is inherently more expensive than a solid
one, which is a property of the brush rather than a regression in it.

## Decision

Add a table of **exceptions** to the lost-frame gate, keyed `<targetId>:<brush>`, and hold
`ipad-device-web:crayon` to 1.5%. Every other cell keeps the single 1% gate.

The table is an exception list, not a budget list. A cell absent from it is scored at
`LOST_FRAME_TIME_SHARE_GATE`, so a passing grade never has to be spelled out anywhere and a target
or brush newly added to the matrix cannot arrive already exempt — it has to meet the standard gate
or be argued into the table. Past runs stay inferable from the matrix output, which prints every
cell's measured share whether or not it is excepted.

Each entry carries the reason and the measurement it was set from, and the generated matrix renders
the whole table under its acceptance-gate section, so a reader never has to infer an exemption from
a number that merely looks passing.

The 1.23% behind this entry was first measured through the split input/measurement transport of
[ADR-0135](0135-split-device-capture-input-and-measurement.md), in one mode. Recapturing the whole
target through the campaign's own Appium transport — the one the matrix is built from — reproduced
it: pen came back at 0.66% against 0.77%, and every one of the twenty cells passed input fidelity at
115–118 contact moves per second. The two transports agree, so the entry is not an artifact of
having been measured through a different input path than the gate governs.

**Set the value from the worst single capture, not the best median.** That recapture is also what
sized this entry, and it moved it. Crayon's four modes are tightly grouped —

| Mode            | Lost frame time |
| --------------- | --------------: |
| portrait-light  |           1.11% |
| portrait-dark   |           1.16% |
| landscape-dark  |           1.16% |
| landscape-light |       **1.40%** |

— except for one. Re-measuring landscape-light three times gave 1.23%, 1.17% and 1.09%, a median of
1.17% in line with everything else, which makes the 1.40% a single-sample excursion rather than a
property of that mode.

It is still the number the threshold has to clear. **A matrix cell is a single capture**, not a
median of three, so a value chosen from medians would have failed that cell roughly whenever the
excursion recurred, with nothing in the output to explain why. An earlier revision of this ADR set
1.4% from a single mode's three-sample median plus an assumed ±0.15 spread, and landed exactly on
the worst observation — zero margin, and precisely the kind of number ADR-0136 warns to treat as
provisional until it has been compared against another run of the same cell.

**Entries only ratchet down** once sized against the full mode sweep. Raising an entry needs the
same evidence as adding one: device measurements, three samples, and the alternatives that were
tried and rejected.

## Consequences

* \+ The gate stays a single number everywhere except where it is written down that it is not, with
  the reasoning attached to the exemption rather than to a commit message.
* − **A single capture prints `FAIL` for a cell the matrix passes.** The exception is keyed on the
  matrix target id, and a capture command is given a device id — it has no way to know which matrix
  row it is filling, so `perf:ios:xcuitest:screen` scores every cell against the flat 1% gate. The
  recapture on 2026-08-22 measured iPad crayon at 1.11% and printed `FAIL` for it. Read a
  capture-time verdict on an excepted cell as the raw number plus a reminder to check this table,
  not as a regression.
* \+ The exception is narrow. It names one brush on one target; crayon on Android physical, on both
  emulators, and on all three desktop browsers is still held to 1%, and iPad crayon in the native
  Capacitor WebView is too.
* \+ A crayon regression on the iPad is still caught. The cell has a budget rather than an
  exemption, and 1.5% against a 1.11–1.17% median band leaves roughly one excursion of slack — wide
  enough not to flap, narrow enough that a real regression crosses it.
* − The matrix can now report "pass" for a cell a reader would expect to fail against the headline
  gate. Rendering the table beside the gates is the mitigation, and it is the reason the table is
  rendered rather than only stored.
* − An exception is easier to add than a fix. The ratchet-down rule and the requirement to record
  rejected alternatives are the only things holding that line, and both are conventions rather than
  anything the tooling enforces.
* − Crayon's cost is now documented rather than solved. If the deposition model is ever reworked — a
  different texture representation, ops that can coalesce, or the single-plane preview that #1206
  never got around to testing — this entry should be re-measured and lowered or removed. **The
  exception records a cost that thirteen implementations failed to reduce, not a proof that no
  implementation can.**
