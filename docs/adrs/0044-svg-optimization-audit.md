# ADR-0044: SVG Optimization as a Re-runnable Audit, Not a One-Off Pass

**Status:** Active
**Date:** 2026-07

## Context

The Splotch logo and the whole `web/src/lib/icons/*.svg` set are inlined into the
DOM via `{@html}` in `Icon.svelte` (`import.meta.glob('../icons/*.svg', {query:
'?raw'})`). Every vector node is therefore a real mount-time DOM element and every
byte ships to the client, so SVG size is both a DOM-size and a payload concern —
`splotchy.svg` alone was the dominant node-count culprit in a page-weight report.

That report was addressed by running `splotchy.svg` through SVGO **once** and
committing the result (140 KiB → 86.5 KiB, 256 → 198 nodes). The problem with a
one-off pass is drift: the moment a contributor adds or hand-edits an icon, the
codebase is out of the optimized state again, and nothing notices. We wanted the
optimization to be a standing invariant the repo can re-establish and enforce,
not a historical event.

The design question was whether that's even possible without tracking "which
files have already been done" in a log — i.e. whether re-running an optimizer on
already-optimized files is safe (idempotent) or whether it slowly degrades them.

**Empirical finding:** SVGO's output for a given input under a fixed config is a
stable fixed point. Across all 52 audited SVGs, a second SVGO pass over the
first pass's output is **byte-for-byte identical** (verified before adopting the
approach). So "already optimized" is simply "SVGO output == file on disk" — no
external bookkeeping is needed to tell new/edited files from done ones.

Two SVGO-config details are load-bearing:

- **`viewBox` must survive.** Icons are sized by CSS (`Icon.svelte` renders the
  `<svg>` at `width/height: 100%`), so they depend entirely on `viewBox` for
  scaling. In SVGO 4 `removeViewBox` is **not** part of `preset-default`, so the
  default preset already preserves it — but this is why we deliberately run the
  stock `preset-default` and add no viewBox-touching overrides.
- **Visually lossless only.** `preset-default` is the visually-lossless preset;
  a full render-and-pixel-diff of original vs optimized across every icon showed
  a worst case of 0.23% of pixels differing (antialiasing at path edges), matching
  the earlier per-icon validation of `splotchy.svg`.

## Decision

Ship the optimization as a re-runnable audit script, `scripts/image-audit.mjs`,
exposed as two npm scripts (ADR-0019 naming):

- `npm run img:audit` — optimize every shipped SVG under `web/` in place with
  SVGO `preset-default` (`multipass`). Idempotent, so it only rewrites SVGs that
  aren't already at their optimized form — newly added or hand-edited ones.
- `npm run img:audit:check` — the same pass in read-only mode; exits non-zero and
  lists any SVG that isn't optimized. Wired into the CI **Quality** job
  (`.github/workflows/test.yml`) as a drift guard alongside lint/format checks.

Because idempotency is empirically guaranteed, there is **no state file / log** of
processed SVGs — the working tree itself is the record, and the CI check is the
enforcement.

**Scope exclusions.** Generator-*input* SVGs are skipped via a small documented
ignore list in the script: `web/static/large-image.svg` and
`web/static/styles/source.svg`. These are never shipped or inlined — they're
consumed by `scripts/gen-*.mjs`. Optimizing them gives no DOM/payload benefit,
and `gen-large-image.mjs` in particular **hand-parses** `large-image.svg`'s
`M x y L x y` path strings and per-`<path>` `stroke`/`stroke-width` attributes,
both of which SVGO's `convertPathData` and attribute plugins rewrite — so
optimizing it would break that generator.

## Consequences

- Adding an un-optimized icon fails CI with an actionable message (`run npm run
  img:audit and commit the result`), keeping the DOM/payload invariant enforced
  rather than aspirational.
- The audit is safe to run at any time; a no-op run confirms the tree is optimal.
- Pinning matters: a future SVGO major that changes its output would make the
  check fail on every file until `img:audit` is re-run and the (still visually
  lossless) result committed. That's the intended, visible signal — the fixed
  point is defined by the installed SVGO + `preset-default`, so bumping SVGO is a
  deliberate re-normalization, not silent drift.
- New generator-input SVGs must be added to the script's `IGNORE` set; otherwise
  the audit will optimize them. This is a known, discoverable trade-off of not
  shipping a separate config file.
