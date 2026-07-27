# Centralize the `MODEL`, `WEBP_QUALITY`, and timeout constants

**Priority/category:** P2[duplication] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `MODEL` at `tools/asset-gen/bin/gen-coloring-fills.mjs:47`,
`gen-coloring-fills-dark.mjs:76`, `gen-coloring-chalk.mjs:69`, `normalize-outline-strokes.mjs:52`,
`gen-coloring-outlines-fresh.mjs:32`, `gen-style-covers.mjs:21`; `WEBP_QUALITY` at fills:48 (90),
dark:78 (90), chalk:70 (92), normalize:53 (92), fresh:33 (90), covers:24 (75) — pinned at SHA
f934d43 **Draft patch:**
docs/audit-deferred/p2-duplication-centralize-the-model-webp-quality-and-timeout-constants.patch

## Verdict

**OPTIONS — real tradeoffs.** The hazardous half (six copies of the model id + timeout) is subsumed
by the FIX for the sibling Gemini-wrapper finding, which removes those constants from the bins
entirely. What's left is only the scattered `WEBP_QUALITY` values, and there the "centralize
everything" the reviewer demanded competes with a cheaper documented-locals approach.

## Original finding (condensed)

`MODEL = 'gemini-3.1-flash-image'` is declared in six files; the last model migration
(`docs/gemini-3.1-migration.md`) had to change all six in lockstep and nothing enforces they stay
equal. `WEBP_QUALITY` is likewise scattered with different values (92 chalk/normalize, 90
fills/dark/fresh, 75 covers) and no recorded rationale for the split. Proposed exporting the model
id, timeout, and named encode-quality constants from one lib module.

## Why it was deferred

Failed adversarial review across three rounds. Unresolved objections: (1) four of six `WEBP_QUALITY`
values were still locally defined after the first commit; (2) after the final commit centralized all
five values, `lib/gemini.mjs` merely renamed them per-script (`CHALK_WEBP_QUALITY = 92`, …) without
the requested one-line WHY for the 92-vs-90-vs-75 split.

## Current state of the code

Fully unresolved at HEAD — all six `MODEL` declarations and all six local `WEBP_QUALITY` values are
still exactly where the finding pinned them (now at chalk:85-86, dark:84/86, fills:58-59,
fresh:34-35, covers:22/25, normalize:55-56). The patch no longer applies: it creates
`lib/gemini.mjs`, which now exists (it holds `makeClient`).

Two facts sharpen the decision:

* `MODEL` and the `120_000` timeout are referenced **only inside the six generateContent wrappers**
  — the `generateImage` extraction recommended in `p1-duplication-gemini-wrappers.md` deletes them
  from every bin as a side effect.
* `WEBP_QUALITY` is referenced in `sharp(...).webp({ quality })` **encode** calls scattered through
  each bin (chalk uses it four times), not in the transport — so it does not centralize for free,
  and `lib/gemini.mjs` (transport) is the wrong home for it anyway.

## Options considered

1. **Land the wrapper FIX, keep `WEBP_QUALITY` local, add the missing WHY comments** (lean). Each
   generator keeps its own constant with a one-liner: 92 — line art is hard black/white edges where
   webp ringing is visible and these files are re-consumed as pipeline inputs; 90 — soft painted
   fills tolerate more compression; 75 — a 448 px cover thumbnail. Pros: zero new modules, the real
   lockstep hazard (model id) is already gone, and the values are genuinely independent per-output
   choices — note `fresh` produces line art at 90, so a semantic `LINE_ART_WEBP_QUALITY = 92`
   grouping would be partly fiction. Cons: no single grep-home for encode settings; does not
   literally satisfy the reviewer's "export shared constants" demand.
2. **Full centralization, but in `lib/encode.mjs`, not `gemini.mjs`.** Re-cut the draft's final
   commit: five per-output exports (`CHALK_WEBP_QUALITY`, `FILL_WEBP_QUALITY`, …) plus the WHY block
   the reviewer asked for, imported by all six bins. Pros: one home, satisfies both recorded
   objections directly. Cons: a new module whose only job is naming five numbers; per-output names
   don't enforce equality any more than locals do; ~six files of import churn in internal tooling.
3. **Drop once the wrapper FIX lands.** Treat scattered qualities as cosmetic. Cons: leaves the
   92/90/75 split undocumented, which is the one part of the finding with real future value (the
   next person tuning output size has no idea which numbers are deliberate).

Ranked 1 > 2 > 3.

## Recommendation

Lean option 1: fold the model id and timeout into the `generateImage` extraction (already the
recommendation of the sibling P1 doc), then a small follow-up commit adding a WHY comment beside
each local `WEBP_QUALITY`. The tradeoff the maintainer must weigh: option 1 leaves no single file
listing every encode quality (grep `WEBP_QUALITY` still returns six files), while option 2 buys that
index at the cost of a five-line constants module and import churn — defensible if a catalog-wide
quality retune is expected, otherwise indirection for its own sake.

## Suggested next step

Fold the `MODEL`/timeout half into the p1 wrapper re-stage; file the `WEBP_QUALITY` WHY comments
(option 1) as a small companion item in the same docs/AUDIT.md entry, noting option 2 only if the
maintainer wants a single encode-settings home.
