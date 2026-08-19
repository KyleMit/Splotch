# PR #1135 — local-warp gate, visual walkthrough

Figures posted as a review comment on PR #1135 (`codex/issue-259-local-warp-gate`), showing what the
local-warp registration gate measures and which committed fills it moves.

Nothing here is part of the gate. These are throwaway visualization scripts kept so the figures can
be regenerated or re-checked; they read the same committed line art and raw fills the scorer reads
and re-derive the correlation surface independently, so a figure that disagreed with
`tools/asset-gen/lib/local-warp.mjs` would be visible as a mismatch rather than hidden.

`WALKTHROUGH.md` beside this file is the walkthrough itself. The rendered figures are hosted on the
`pr-assets` branch under `local-warp-gate/` (ADR-0046), not duplicated here; the scripts below write
fresh copies into a gitignored `out/`.

## Figures

| File                | Shows                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `fig-synthetic.png` | The controlled test shapes: a whole-image slide is absorbed, one feature moving alone is not         |
| `fig-quiver.png`    | Every scored tile's offset on one page, before and after the median residual is subtracted           |
| `fig-aperture.png`  | The excavator correlation ridge, and the argmax walking outward as the search window grows           |
| `fig-excavator.png` | The same excavator tiles under the first implementation and the corrected one                        |
| `fig-overgate.png`  | The six committed fills above the strict 4px default, each with its crop, edge overlay, and read-out |
| `fig-contact.png`   | The twelve remaining pages that score above zero, all well under the gate                            |

## Running them

```sh
cd docs/scratchpad/pr-1135-local-warp-walkthrough
node fig-synthetic.mjs   # writes out/fig-synthetic.png
```

`fig-excavator.mjs` additionally needs the pre-review scorer beside it:

```sh
git show b857b11f:tools/asset-gen/lib/local-warp.mjs > local-warp-v1.mjs
```

`walk.mjs` prints the search-window stability table (argmax per search radius) for the six over-gate
tiles plus the excavator.
