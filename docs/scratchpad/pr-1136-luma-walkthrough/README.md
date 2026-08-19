# PR #1136 visual walkthrough — evidence

The walkthrough itself is [WALKTHROUGH.md](WALKTHROUGH.md). Review-only artifacts for the
"Centralize asset luma conventions" PR. Nothing here is wired into the build; the branch exists so
the figures have a stable raw URL for the PR comment.

`figures/` holds the rendered figures. `tools/` holds the scripts that produced them:

| Script             | Produces                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `figure.mjs`       | shared SVG grid layout used by every figure                                 |
| `gate-punch.mjs`   | A1/A2/A3 — the punch-fill inpaint mask                                      |
| `gate-outline.mjs` | B1 — outline-analysis's two products, one refactored and one fenced         |
| `fences.mjs`       | C1 — libvips grayscale vs Rec.601 across the three fenced contexts          |
| `fence-white.mjs`  | C2 — the composite-eye DARK/WHITE gates redrawn under both conversions      |
| `fence-scan.mjs`   | the whole-catalog divergence + threshold-flip numbers quoted in the comment |
| `gate-eye.mjs`     | D1 — eye cores and annulus bands with their measured lumas                  |
| `gate-night.mjs`   | E1/E2 — night background median and invented-white drift                    |
| `gate-halo.mjs`    | F1 — rimΔ and the halo window                                               |
| `verify.mjs`       | the cross-tree scorer digest (run once per worktree, then diff)             |
| `emit-punch.mjs`   | per-tree punched night fills for the pixel diff                             |
| `receipt.mjs`      | G1 — the base-vs-PR pixel difference of those fills                         |
| `quantile.mjs`     | H1 — the median selection convention                                        |

The scripts expect to run from a worktree root with `node_modules` available; `verify.mjs` and
`emit-punch.mjs` are written to run unchanged in both the base and the PR tree.
