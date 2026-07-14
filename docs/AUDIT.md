# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Session audit

### [Execution] Night-fill shipping step: samples dirs resolve to repo root, and `*.input.webp` debug siblings break batch cp/punch

**File(s):** `tools/asset-gen/docs/pipeline.md` (Stage 4 "Shipping" step),
`tools/asset-gen/docs/README.md` ("Review scratch" line), `tools/asset-gen/lib/paths.mjs`
(`SAMPLES_DARK_DIR`), `tools/asset-gen/lib/punch-fill.mjs` (~line 102)

#### Problem

Two path traps in the same shipping step, both hit this session. (1) The docs list the review
scratch as bare `.coloring-samples/` / `.coloring-samples-dark/` without saying they are
**repo-root**-relative (`lib/paths.mjs` joins them to `REPO_ROOT`); since asset-gen presents as a
self-contained folder, the natural guess is inside it —
`ls tools/asset-gen/.coloring-samples-dark/chalk/objects/` failed with "No such file or directory"
and took a `find` to recover. (2) The samples dir holds `{page}.input.webp` debug files (the negated
model input) beside the takes, so the obvious batch ship
`for f in .coloring-samples-dark/shapes/*.webp; do cp ... $p.night.raw.webp` manufactured bogus raws
(`circle-tall.input.night.raw.webp`) and the next `gen:coloring-punch` **crashed** mid-category
(`Missing line art for shapes/circle-tall.input.night.raw.webp`), needing a manual `rm` of the junk
raws. pipeline.md's shipping step only shows a single-page `cp`, so every future whole-category ship
re-derives the batch form and can hit both traps. Cost: **minor** (each recovered in one step), but
recurrence is per-category. **Recurred 2026-07-14** (trap 1): a composite-analysis script hard-coded
`tools/asset-gen/.coloring-samples-dark/...` and failed with `ENOENT`, needing a `find` to recover
the repo-root location — the same wrong guess, so the fix still hasn't landed where the next session
looks.

#### Proposed solution

In `pipeline.md` Stage 4 shipping (and the README "Review scratch" line): note the samples dirs live
at the **repo root** (`lib/paths.mjs` `SAMPLES_DARK_DIR`), and give the safe batch one-liner that
excludes debug files, e.g.
`for f in .coloring-samples-dark/<cat>/*.webp; do case $f in *.input.webp) continue;; esac; ...`.
Belt-and-braces: make `punch-fill-outlines.mjs` skip (with a warning) any raw matching
`*.input.night.raw.webp` / `*.input.light.raw.webp` instead of crashing the whole run on the missing
line art.

#### Verification

A fresh session shipping a whole category from the docs alone performs zero failed `ls`/`cp` calls,
and `npm run gen:coloring-punch -- <cat>` completes even if a stray `*.input.*` file was copied.
