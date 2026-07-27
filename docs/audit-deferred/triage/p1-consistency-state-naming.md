# Unify the exported `$state` object naming across state modules

**Priority/category:** P1[consistency] · **Cluster:** C04 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/state/canvas.svelte.ts:6`,
`web/src/lib/state/strokeWidth.svelte.ts:26`, `web/src/lib/state/tool.svelte.ts:54`,
`web/src/lib/state/colors.svelte.ts:59`, `web/src/lib/state/settings.svelte.ts:150`,
`web/src/lib/state/ui.svelte.ts:42`, `web/src/lib/state/layout.svelte.ts:29`,
`web/src/lib/state/install.svelte.ts:37`, `web/src/lib/state/network.svelte.ts:8`,
`web/src/lib/state/fullscreen.svelte.ts:31` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**OPTIONS — real tradeoffs.** The finding's premise (two conventions, no predictable rule) still
holds, but its proposed fix — "mechanical rename to the bare noun" — is no longer mechanical. Code
drift since the pin added a hard collision: `ui.svelte.ts` now exports a modal controller named
`coloringBook`, so `coloringBookState → coloringBook` cannot happen without renaming something else,
and two files already import both names side by side. Lean: bare noun where it is unambiguous, keep
the `State` suffix as *documented disambiguation* where the bare noun is claimed.

## Original finding (condensed)

The primary `$state` export follows two conventions: `canvasState`/`strokeState`/`toolState` use a
`…State` suffix while seven modules (`colors`, `settings`, `ui`, `layout`, `install`, `network`,
`fullscreen`) export the bare noun. Importing a store means remembering (or grepping) which club its
module is in. Proposed renaming the minority to bare nouns (`canvasState → canvas`,
`strokeState → stroke`/`strokeWidth`, `toolState → tool`) as a compiler-checked mechanical rename.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

The split persists, and is actually 7-vs-**4**: the finding missed `coloringBookState`
(`coloringBook.svelte.ts:18`), which already existed at the pinned SHA. Verified at HEAD:

* Suffixed: `canvasState` (`canvas.svelte.ts:14`), `strokeState` (`strokeWidth.svelte.ts:48`),
  `toolState` (`tool.svelte.ts:53`), `coloringBookState` (`coloringBook.svelte.ts:18`).
* Bare: `colors` (:61), `settings` (:133), `ui` (:22), `layout` (:29), `install` (:29), `network`
  (:8), `fullscreen` (:31), each in its module.
* Modules added since the pin (`aiGeneration`, `aiKey`, `saveFolder`, `modal`) export only functions
  or a factory — they don't change the tally, but every future module re-rolls the dice.

The collision check the rename plan depends on:

* **`coloringBook` — hard collision (new since the pin).** `ui.svelte.ts:36-39` now exports modal
  controllers `colorPicker`, `coloringBook`, `parentCenter`, `aiPrompt` (built by
  `modal.svelte.ts`'s `createModal()`). `ActionsPanel.svelte` and `ColoringBook.svelte` each import
  *both* `coloringBook` (the modal) and `coloringBookState` (the page/orientation state) today. The
  bare-noun rename is blocked unless the modal is renamed too.
* **`canvas` — soft collision.** No current consumer of `canvasState` (43 refs, 10 files) declares a
  local `canvas`, so the rename would compile. But `canvas` is the single most common local variable
  name in the codebase (~30 files in `lib/drawing/`, actions, components hold an `HTMLCanvasElement`
  named `canvas`; e.g. `earlyBoot.ts:36`). Any future import of a store named `canvas` into that
  layer forces aliasing, and the store isn't a canvas — it is engine-derived status (`canUndo`,
  `canvasEmpty`, `strokeCount`, `paperOrientation`).
* **`tool`, `stroke` — clean.** No consumer of `toolState` (61 refs, 12 files) or `strokeState` (29
  refs, 4 files) uses those bare identifiers anywhere (only comments).

Churn asymmetry, for sizing the options: renaming the 4 suffixed exports touches ~150 refs in ~20
files; renaming the 7 bare exports to suffixed touches several hundred refs across 40+ files
(`settings` alone appears in 43 files).

## Options considered

1. **Bare noun by default; `State` suffix only as documented disambiguation (lean).** Rename
   `toolState → tool` and `strokeState → strokeWidth` (matches its filename and content —
   `penSize`/`eraserSize`; bare `stroke` would collide conceptually with "a drawn stroke"). Keep
   `canvasState` and `coloringBookState`, whose suffixes are load-bearing: they distinguish the
   store from the canvas element and the `coloringBook` modal. Codify the rule where state
   conventions already live: `.claude/rules/svelte.md` (edit in place) and the `lib/state/` bullet
   of `web/src/.ruler/AGENTS.md` (then `npm run ruler:apply`). Pros: cheapest rename (~90 refs, 13
   files), zero collisions, the surviving suffixes now *mean* something, newcomers get a written
   rule. Cons: the rule has a judgment call in it — prediction is "bare noun unless claimed", not
   purely mechanical.
2. **Full bare-noun unification.** Option 1 plus `canvasState → canvas` and
   `coloringBookState → coloringBook`, renaming the ui modal `coloringBook → coloringBookModal`.
   Pros: one mechanical rule, exactly what the finding asked for. Cons: breaks the modal exports'
   own symmetry (`colorPicker`/`parentCenter`/`aiPrompt` stay bare) unless all four grow `Modal`,
   widening the diff; plants a store named `canvas` in a codebase where that word means the element;
   `coloringBook` remains three-way ambiguous (state module, modal, the `ColoringBook.svelte`
   component).
3. **Suffix everywhere (`settingsState`, `uiState`, …).** Pros: collision-proof by construction —
   the suffix is namespacing, which is precisely why the suffixed four never collided. Cons: ~5x the
   churn, on the most-imported modules; reads worse at every call site
   (`settingsState.soundEnabled`); moves *against* the 7-module majority.
4. **Drop.** Editor auto-import makes the wrong-guess cost near zero. Cons: the inconsistency is
   real, grows with every new module, and this is the cheapest moment to fix it.

## Recommendation

Option 1. Concretely:

```ts
// tool.svelte.ts
export const tool = $state({ brush: DEFAULT_BRUSH, color: DEFAULT_COLOR });
// strokeWidth.svelte.ts
export const strokeWidth = $state({ penSize, eraserSize });
// canvas.svelte.ts, coloringBook.svelte.ts — unchanged, suffix kept deliberately
```

And in `.claude/rules/svelte.md`, under the shared-state bullet:

> A module's primary `$state` export is the bare module noun (`settings`, `ui`, `tool`). Use a
> `State` suffix only when the bare noun is already claimed by a more concrete thing — `canvasState`
> (the canvas is an element), `coloringBookState` (the modal controller and component own the bare
> name) — and say so in a comment beside the export.

The maintainer must weigh: is a documented rule-with-exceptions (Option 1) acceptable, or is full
mechanical uniformity (Option 2) worth renaming the modal layer and living with a `canvas` store? If
uniformity wins, take Option 2 *with* the `Modal` suffix applied to all four controllers so the
modal namespace stays self-consistent. Verification for any option: `npm run check` plus the unit
suite; the finding's suggested `grep "State = \$state"` gate only applies to Options 2/3.

## Suggested next step

File as a `type:audit` issue carrying the collision analysis above (the AUDIT-DEFERRED entry's
"mechanical rename" framing is stale and would mislead an implementer). Land the `tool`/
`strokeWidth` renames and the rule edit in one PR; they are safe under every option except 3.
