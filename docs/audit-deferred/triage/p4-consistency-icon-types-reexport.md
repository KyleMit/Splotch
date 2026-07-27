# `iconTypes.ts` imports `IconName` and separately re-exports it — redundant

**Priority/category:** P4[consistency] · **Cluster:** C07 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/iconTypes.ts:1-4` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**FIX — clear winner**, and simpler than every proposal on record: the re-export is *dead code* —
nothing in the repo imports `IconName` from `iconTypes` — so line 3 should be deleted outright, not
consolidated. Executed as a one-line ride-along on the C07 P2 patch, not a standalone re-stage.

## Original finding (condensed)

`iconTypes.ts` both imports `IconName` from `./icon-names` (to build `CommonIconName`) and
independently re-exports it from the same module on the next line — a doubled reference that is easy
to misread as two symbols. Proposed collapsing to a single reference to `./icon-names`.

## Why it was deferred

The brief's proposed fix was wrong: deleting the `import type` line and keeping only
`export type { IconName } from './icon-names'` fails `npm run check` with "Cannot find name
'IconName'" — a re-export statement creates no local binding, so `Exclude<IconName, ...>` no longer
resolves. The implementer correctly reverted rather than substitute an unrequested alternative, and
flagged that re-staging needs a corrected proposal.

## Current state of the code

`iconTypes.ts` is unchanged at HEAD — the exact four lines from the finding. The decisive new fact,
verified by exhaustive grep for `iconTypes` across `web/src`, `web/tests`, and `scripts`: all nine
importers (`Icon.svelte`, `Icon.svelte.test.ts`, `strokeWidth.svelte.ts`, `tool.svelte.ts`, and five
`parent/*` components) import **only `CommonIconName`**. Every `IconName` consumer
(`SectionIcon.svelte`, `parent/sections.ts`) imports it directly from `./icon-names`. The re-export
has no callers.

## Options considered

Short, since deletion dominates:

1. **Delete line 3** (winner). Removes the doubled reference *and* dead API surface; keeps the
   import the failed attempt proved is load-bearing. Nothing can break — the export has no
   importers.
2. **Keep a re-export, consolidated** (runner-up, only if the maintainer wants `iconTypes` to stay a
   one-stop icon-types facade): keep line 1 and change line 3 to `export type { IconName };` —
   re-exporting the local binding compiles, including under the project's `verbatimModuleSyntax`,
   unlike the brief's from-clause version. Rejected as default: it preserves an export nobody uses.
3. **DROP.** Honestly weighed: the finding's "drifts if the source path changes" claim is weak (a
   rename breaks the import on line 1 at compile time anyway — nothing silent), and a two-line tidy
   would not justify a burndown re-stage on its own. What tips it to FIX: the fix is now a
   known-correct one-line *deletion of dead code* (a slightly stronger claim than the original
   finding made), and a free vehicle exists — the C07 P2 patch already rewrites `iconTypes.ts`.

## Recommendation

After the P2 patch is applied (its `iconTypes.ts` hunk uses the re-export line as context, so
deleting first would break the patch), delete the re-export line. The file's top becomes:

```ts
import type { IconName } from './icon-names';

// (P2's NON_RENDERABLE_ICONS block)
export type CommonIconName = Exclude<IconName, (typeof NON_RENDERABLE_ICONS)[number]>;
```

Verification: `npm run check` passes; grep confirms no importer of `IconName` from `iconTypes`
appeared in the meantime.

## Suggested next step

Do not re-stage as its own finding. Fold the one-line deletion into the C07 P2 implementation commit
(note it in that re-staged brief), and record here that if P2 is abandoned, this alone drops.
