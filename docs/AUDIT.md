# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Session audit

### [Tooling] Chalk keep gate rejects correct whitened-pupil chalks and offers no sanctioned apply path

**File(s):** `tools/asset-gen/bin/gen-coloring-chalk.mjs` (gate 1 keep/localKeep, apply block ~lines
409–421; `--force` at ~line 320 only skips the already-shipped check),
`tools/asset-gen/lib/outline-match.mjs`

#### Problem

The worst-tile keep gate scores the chalk against the raw pen, so a chalk that *correctly* whitens a
big solid pen pupil into sclera + outlined pupil — the judgment call the pen/chalk fork exists to
make — reads as "untraced ink" in that tile and fails. During the 2026-07 full-catalog migration
this fired **13 times across 6 categories** (`objects/flower-tall` 75.4%, both `vehicles/police-*`
62.9/77.0%, seven `shapes/*` pages 49.7–77.8%, `farm/cat-tall`+`dog-tall`,
`dinosaur/pterodactyl-tall`+`trex-tall`, `creatures/owl-*`+`dragon-tall`+`unicorn-tall`,
`space/moon-tall`), each printing `✗ NOT applied — gates unmet` on a candidate whose overlay showed
the miss confined to the deliberately whitened regions. There is **no CLI path to apply a reviewed
candidate**: `--force` only bypasses the already-shipped skip (discovered by reading the source
mid-run), so every one of the 13 was shipped by hand-`cp` from `.coloring-samples-dark/chalk/` —
byte-identical to what `--apply` writes, but undocumented and easy to get wrong. Retries don't help:
the failure is structural (the model *should* whiten), so extra attempts just burn API calls
(flower-tall wasted 6+8 attempts before the pattern was recognized). Cost: **slow**, and guaranteed
to recur on any future page with solid pen pupils while pens stay un-normalized (the audit counts 72
solid outlines catalog-wide).

#### Proposed solution

Preferred: whiten solid pen interiors out of the keep **reference** before scoring, exactly the way
`normalize-outline-strokes.mjs` gate 4 whitens solid interiors and over-ringed eye interiors out of
*its* reference — removing them is the goal, not drift (pipeline.md already sketches this under the
2026-07 batch lessons). The machinery exists in `lib/solid-regions.mjs`. Fallback (or complement):
an explicit `--apply-reviewed <page>` flag that applies the best candidate despite a failed keep
gate while still enforcing enclosure/white budget/eye polarity, printing the overlay path so the
human step stays in the loop.

#### Verification

Re-run `npm run gen:coloring-chalk -- shapes/circle-tall --rescore` (offline, re-gates the saved
candidate): with the reference fix the shipped candidate's worst tile should score ≥ 80% instead of
49.7%. Durable check: the next new-category run ships a big-pupil chalk via `--apply` (or
`--apply-reviewed`) with zero hand-`cp` steps.

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
