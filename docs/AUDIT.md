# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Session audit

### [Tooling] gen-coloring-fills-dark result lines misreport gate outcomes ("ok" + warning = failed gate, "(N tries)" = kept attempt index)

**File(s):** `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (retry loop ~lines 444–486 and the
per-page result line)

#### Problem

The per-page output prints `ok` even when a gate never passed — the loop exhausts `--max-attempts`,
keeps the fallback-ranked best take, and the only signal of the failure is the trailing `⚠` (e.g.
`vehicles/train-wide ... ok ... (2 tries) ... lineW 51 ⚠ dark outlines` after 8 attempts at
`--line-white-min 175`). And `(2 tries)` is the **attempt index of the kept take**, not how many
attempts ran — which reads as "the loop stopped after 2". In this session that combination made a
strict-gate retry look like the retry loop was broken; diagnosing it required reading ~80 lines of
the retry/gate source mid-run before concluding the model (not the loop) was resisting. Anyone
processing a category reads dozens of these lines and will mis-triage warned pages the same way.
Cost: **slow**. **Compounded 2026-07-14**: this session added a fourth warning glyph to the same
line — `⚠ blank-orb eyes (N, median …)` from the new composite-eye gate
(`gen-coloring-fills-dark.mjs` result line) — so the "`ok` + `⚠` = a gate failed" ambiguity now
covers one more failure mode; fixing the line format is worth more the more warnings it carries.

#### Proposed solution

Make the result line say what happened: print `kept attempt 2/8` instead of `(2 tries)`, and when a
gate never passed print its status as failed rather than folding it into a warning glyph (e.g.
`line-gate FAILED (best 51 < 175) — kept least-bad take`). One-line change in how the take's
metadata is formatted; alternatively (weaker) document the line format in
`tools/asset-gen/docs/pipeline.md` Stage 4 next to the levers list.

#### Verification

Run a page with an unreachable bar (`--line-white-min 999 --max-attempts 2`): the output must show
that all 2 attempts ran and that the line gate failed, without needing the source to interpret it.

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
