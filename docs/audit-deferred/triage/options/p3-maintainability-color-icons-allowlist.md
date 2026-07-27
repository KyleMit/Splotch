# `COLOR_ICONS` is a 24-entry hand-maintained allowlist mixing two unrelated concepts

**Priority/category:** P3[maintainability] · **Cluster:** C07 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/Icon.svelte:13-42` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**OPTIONS — real tradeoffs.** The finding's build-time generation is workable but its brief glossed
over two things (the generator must start emitting a runtime *value* module, and the guard test does
not fully disappear), which narrows its lead over a much smaller split-the-list change. Lean:
generation, with the corrections below.

## Original finding (condensed)

`COLOR_ICONS` conflates (1) genuinely full-color "spot" icons — machine-detectable, since
`scripts/lib/iconChroma.mjs`'s `isSpot` already classifies them for the icon sheet — and (2)
monochrome stroke-size previews that self-tint via `currentColor`/theme vars. Category 1 (~13
entries) is hand-listed anyway, policed by a dedicated guard test. Proposal: extend `gen:icons` to
emit a `COLORFUL_ICONS` const from `isSpot`, keep only a small hand list of self-tinting opt-outs,
union the two in `Icon.svelte`.

## Why it was deferred

Implementation never ran: the burndown driver's brief file was stale (still held the previous
finding's brief), so the implementer deferred to keep the entry recoverable. A driver defect, not a
finding defect — the verifier had marked it VALID. No reviewer objections exist; the proposal itself
was never tested.

## Current state of the code

The finding holds at HEAD with minor drift: the set is now 23 entries (`sweep-icon` was removed) and
is typed `Set<CommonIconName>` (`Icon.svelte:15-43`). The split is still 13 spot icons + 10
`size-*`/`eraser-size-*` self-tinting previews, delineated only by an inline comment. The guard test
(`Icon.svelte.test.ts`) still runs `isSpot` per icon via `it.each` and enforces the one-directional
`{colorful} ⊆ COLOR_ICONS`. Relevant context the brief did not record:

* `gen:icons` (`scripts/generate-icon-names.mjs`) currently emits only `icon-names.d.ts` — an
  ambient **type** declaration. A runtime `COLORFUL_ICONS` const cannot live in a `.d.ts`; the
  generator must emit a second, value-bearing `.ts` module.
* `icon-names.d.ts` is committed, and `gen:icons` re-runs in `prebuild`/`prebuild:cap`. No CI drift
  gate diffs the committed copy against the SVGs.
* Staleness of a committed generated const is largely self-limiting for *new* icons: the type union
  regenerates in the same `gen:icons` run, so an icon absent from the const is also absent from
  `IconName` and unusable through `<Icon>` until the dev regenerates — which updates both. The one
  real gap: recoloring an *existing* SVG (monochrome → colorful) without re-running `gen:icons`
  changes neither the union nor the const, and today's guard test is exactly what catches that.

## Options considered

1. **Build-time generation** (the finding's proposal, corrected — lean). `gen:icons` additionally
   emits e.g. `icon-meta.ts` with `export const COLORFUL_ICONS = [...] as const;` computed via
   `isSpot` (already imported by `gen-icons-sheet.mjs`, so the cross-tree seam exists).
   `Icon.svelte` keeps a 10-entry `SELF_TINTING_ICONS` hand list and unions:
   `new Set<CommonIconName>([...COLORFUL_ICONS, ...SELF_TINTING_ICONS])`. Replace the per-icon
   `it.each` guard with a single freshness assertion (committed const equals `isSpot` over the svg
   glob) to close the recolored-existing-SVG gap. Pros: adding a spot SVG needs zero manual edits;
   `prebuild` self-heals staleness for shipped builds; fits the repo's committed-generated-artifact
   culture (`icon-names.d.ts`, `gen:tokens`). Cons: `gen:icons` starts emitting runtime code (new
   committed generated source file, formatting/lint surface); a classifier misfire now
   auto-propagates instead of pausing at a human-edited list (mitigated: the current guard already
   forces the classifier's verdict into the list, so the checkpoint it removes is mostly
   ceremonial); the guard test shrinks rather than disappears, so the machinery saved is less than
   the finding implies.
2. **Split the hand list only**: `SPOT_ICONS` + `SELF_TINTING_ICONS`, both hand-maintained, union in
   `Icon.svelte`; keep the existing guard test pointed at `SPOT_ICONS` (which lets it become
   bidirectional — equality instead of superset — a small correctness win). Pros: tiny diff, no
   generator changes, fixes the two-concepts conflation the finding leads with. Cons: the 13
   derivable entries stay hand-typed; each new spot icon still needs a manual edit prompted by a
   test failure.
3. **Status quo (drop)**: the superset + one-directional guard already machine-checks the hand list,
   and the inline comment already delineates the two categories. Rejected as the resting verdict —
   the finding was verified VALID and never disproven, and both options above are cheap — but it is
   fair to say the current setup is guarded, not broken, which is why this is P3 and OPTIONS rather
   than a FIX.

## Recommendation

Lean **option 1**, amended as above: emit a value module (not `.d.ts`), commit it, keep a one-assert
freshness test in place of the per-icon `it.each`. If the maintainer doesn't want `gen:icons`
producing runtime code — the one genuinely new kind of surface — option 2 captures most of the
conceptual cleanup for a tenth of the change. The tradeoff to weigh: removing a test-policed manual
step vs teaching the icon generator to emit executable source.

Sequence after the C07 P2 patch lands: that patch rewrites `Icon.svelte.test.ts` (shared
`iconNameFromPath`) and adds a guard that scrapes this very test file's glob literal, so whatever
remains of the test here must keep its `import.meta.glob` exclusion literal (or the P2 guard's
file-list assertion must be updated in the same commit).

## Suggested next step

Re-stage in `docs/AUDIT.md` — not quite "as-is": carry the deferral section's note that this was a
driver defect, and fold the two corrections (value-module output; retain a slim freshness assert)
plus the P2 sequencing note into the brief so the implementer doesn't rediscover them.
