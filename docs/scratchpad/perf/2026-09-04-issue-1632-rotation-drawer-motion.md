# Issue 1632: Android rotation and stale Action Drawer motion

Date: 2026-09-04\
Runtime: physical Android Chrome, 60 Hz pinned refresh regime\
Mode: portrait-light\
Repeats: one warm-up plus three scored

## Hypothesis

The canonical Settings round-trip can leave `data-drawer-motion` armed while the Action Panel is
behind the modal. Later device rotations then animate the drawer's portrait/landscape margin change
inside the scored rotation window. Clearing that marker on the standard and legacy orientation
signals, before `resize`, should retain deliberate drawer open/close motion while removing
rotation-only work.

## Control

Product commit: 6e2def891a8471e26d6107709bf128ea7efe3861

The focused rotation sweep passed the issue's landscape-to-portrait with-ink cell at per-repeat
maxima `[16.8, 16.8, 16.7]` ms, pooled P95/max `16.8/16.8`.

The sequence-faithful canonical sweep reproduced the problem in the opposite direction:

| Action                                  | Per-repeat maxima (ms) | P95 / max (ms) | Result |
| --------------------------------------- | ---------------------- | -------------- | ------ |
| with ink: portrait → landscape rotation | `[16.7, 66.7, 33.4]`   | `33.4 / 66.7`  | fail   |
| with ink: landscape → portrait rotation | `[16.8, 16.8, 16.8]`   | `16.8 / 16.8`  | pass   |
| empty after clear: portrait → landscape | `[16.8, 33.4, 33.3]`   | `16.8 / 33.4`  | pass   |
| empty after clear: landscape → portrait | `[33.3, 16.8, 16.8]`   | `16.8 / 33.3`  | pass   |
| idle frame control                      | `[16.8, 16.8, 33.3]`   | `16.8 / 33.3`  | pass   |

Only one with-ink repeat breached 33.5 ms, so the cell failed P95 rather than the confirmed-max
rule. Its 66.7 ms frame overlapped `actions-drawer` margin transitions. All four rotation actions in
every scored repeat recorded those transitions.

## Treatment

Product commit: fc2153436e17d6c9dbe7f38fadaaa28d9539cf1a

| Action                                  | Per-repeat maxima (ms) | P95 / max (ms) | Result |
| --------------------------------------- | ---------------------- | -------------- | ------ |
| with ink: portrait → landscape rotation | `[16.7, 16.7, 16.8]`   | `16.7 / 16.8`  | pass   |
| with ink: landscape → portrait rotation | `[16.8, 16.8, 16.7]`   | `16.8 / 16.8`  | pass   |
| empty after clear: portrait → landscape | `[16.8, 16.8, 16.8]`   | `16.8 / 16.8`  | pass   |
| empty after clear: landscape → portrait | `[16.8, 16.8, 16.8]`   | `16.8 / 16.8`  | pass   |
| idle frame control                      | `[16.8, 16.8, 16.8]`   | `16.8 / 16.8`  | pass   |

No scored treatment rotation sample recorded an Action Drawer transition. The regression test holds
a drawer transition open, fails when the product handler is removed, and passes when it is restored.

The treatment canonical sweep separately put `scroll coloring pages` red at maxima
`[33.2, 33.3, 33.3]` ms and pooled P95/max `33.2/33.3`; the control canonical sweep had passed it.
An immediate focused treatment recheck passed at `[33.4, 33.3, 16.8]`, pooled `16.8/33.4`, so the
scroll result is preserved as run variance rather than attributed to the rotation treatment.

## Result

Keep the treatment. It removes the attributed drawer animation from the affected rotation window,
makes both with-ink directions green in the canonical sweep, preserves normal drawer interaction
motion, and has a source-level regression test. The final single-commit physical matrix recapture
remains authoritative for closing #1632.
