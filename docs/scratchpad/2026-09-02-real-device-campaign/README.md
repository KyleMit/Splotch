# 2026-09-02 real-device performance campaign — A/B action evidence

The compact record of every physical-iPad action A/B the campaign ran (iPad13,8 · iPadOS 26.5 ·
Safari, driven through `perf:ios:xcuitest:actions`, one warm-up plus three scored repeats). Each
file keeps the per-action summaries, the per-sample first-frame, readiness, and rounded post-action
frame gaps, and the served entry module that identifies the build; the multi-megabyte raw artifacts
stay in the capture host's gitignored `perf-profiles/`. The drawing recapture of the same night is
in the tracked corpus `perf-profiles/evidence/2026-09-02-release-gate-recapture/`.

| File                                 | Build                                                  | Sweep                               |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------- |
| `layer1-main-*`                      | `origin/main` 6e1c8500104a076cd1abe2d41d8c0a2e6870667a | canonical full sweep                |
| `layer1-tiers-*`                     | raster presentation tiers, PR 1553 at f726d68c3        | canonical full sweep                |
| `layer3-blur-on-portrait-light`      | `origin/main` (blur on)                                | `--actions=settings,theme,coloring` |
| `layer3-blur-off-portrait-light`     | uncommitted B arm: no `backdrop-filter`, dim 0.7       | `--actions=settings,theme,coloring` |
| `layer3-shipped-full-portrait-light` | 31476d91d3ec8487d0fcad7492425cf0a6642584 (ADR-0157)    | canonical full sweep                |

What they decided:

* **Layer 1 (PR 1553, negative result).** Tiers vs `main`: no scored frame moved in portrait
  (`select coloring page` 21/23 vs 21/22 ms) or landscape (26/28 vs 26/91), readiness P95 on select
  rose 131 → 229 / 235 ms. The matrix's 76–88 ms `clear coloring page` red was already gone on
  `main` (39f75bf0928bfecba1aafae9cbf89d159ebd4029).
* **Layer 3 (PR 1558, shipped).** Blur off vs on: `clear coloring page` 28/28/28 → 17/17/18 ms,
  `select coloring page` 31/31/33 → 18/18/32; Settings and theme switches unchanged. The shipped
  build's canonical sweep turned portrait-light's select green (17/19 vs 21/23 on `main`) and kept
  the `save screenshot` 32–37 ms export frame both arms share.

The blur-off arm has no commit of its own (the shipped form differs from it), so it could not be
promoted through `perf:evidence:keep`; this folder is its record.
