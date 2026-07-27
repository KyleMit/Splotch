# `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**Priority/category:** P2[duplication] · **Cluster:** C12 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5`, `web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`,
`drawing/engine.ts:258`, `components/ParentCenter.svelte:60`, `tests/global.d.ts:48` — pinned at SHA
f934d43 **Draft patch:**
docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places.patch

## Verdict

**FIX — clear winner.** Apply the draft patch as-is — it applies cleanly at HEAD and is complete for
this finding. The reviewer's sole objection was about collateral damage to a *different* deferred
draft; satisfying it means rebasing that sibling patch, not changing this one.

## Original finding (condensed)

The literal union `'portrait' | 'landscape'` is declared independently eight times — as
`Orientation` twice (`notchBand.ts`, `layout.svelte.ts`), as `OrientationLockType`
(`orientation.ts`), as `BookOrientation` (`books.ts`), and inlined anonymously in four more spots.
Any widening (e.g. `'square'`) touches every copy and there is no single grep target. Proposal: one
canonical `export type Orientation` in `platform.ts`, imported everywhere; keep
semantically-distinct aliases as `type X = Orientation` where the name adds meaning.

## Why it was deferred

The implementer delivered the full consolidation but no fix round for the one unresolved objection,
which is cross-patch, not in-patch: the separately deferred draft
`docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`
(a) adds `import { layout, type Orientation } from '$lib/state/layout.svelte'` in
`ClearButton.svelte` — an export this patch deletes — and (b) still carries
`type OrientationLockType = 'portrait' | 'landscape'` in its rewritten `orientation.ts` hunks. The
reviewer required that reapplicable draft be updated to use the canonical type from `platform.ts`.

## Current state of the code

All eight duplication sites hold at HEAD (verified by grep): `notchBand.ts:38`,
`layout.svelte.ts:4`, `orientation.ts:5`, `books.ts:50`, `canvas.svelte.ts:26`, `engine.ts:262`,
`tests/global.d.ts:49`, and — the one drift — the `ParentCenter.svelte` copy now lives in the
extracted `components/parent/CompactShell.svelte:29` (`LockedOrientation`). The draft was cut after
that extraction: it targets `CompactShell.svelte`, and `git apply --check` passes at HEAD. It adds
`export type Orientation` to `platform.ts:52` beside `Platform`, converts all eight consumers to
type-only imports, keeps the meaningful aliases (`BookOrientation`, `OrientationLockType`,
`LockedOrientation`) as `= Orientation`, and preserves `notchBand.ts`'s type-only-import purity (no
runtime `platform.ts` import reaches the pure layer).

## Options considered

1. **Apply the draft, then rebase the effect-bodies sibling draft (winner).** This patch passed
   type-check, unit-test, and lint gates and needs zero content changes. The objection is
   mechanical: in the effect-bodies patch, change `ClearButton.svelte`'s type import source from
   `$lib/state/layout.svelte` to `$lib/platform`, and keep
   `type OrientationLockType =
   Orientation` (importing it) in its `orientation.ts` hunks — its
   current hunks also carry the old literal as context, so they conflict outright once this lands; a
   3-way rebase of that patch is needed regardless.
2. **Re-export `Orientation` from `layout.svelte.ts` as a compatibility shim** so the sibling draft
   applies untouched. Rejected: it preserves the second grep target the finding exists to remove,
   and the sibling draft still conflicts on its `orientation.ts` context lines anyway — the shim
   buys nothing.
3. **DROP.** Rejected: all eight copies are live at HEAD, the fix is done and green, and the
   canonical home (`platform.ts`) is exactly where the C12 folder finding wants the platform
   vocabulary to live.

## Recommendation

Apply the patch with `git apply` — no edits. Record the objection's remedy against the
*effect-bodies* deferred finding, where the work actually lands: rebase that patch so it reads

```ts
// ClearButton.svelte
import type { Orientation } from '$lib/platform';
import { layout } from '$lib/state/layout.svelte';

// orientation.ts (its rewritten header)
import type { Orientation } from '$lib/platform';
type OrientationLockType = Orientation;
```

Verification per the original brief: `git grep "'portrait' | 'landscape'"` returns only
`platform.ts`'s single definition, and `npm run check` passes (the patch already met this at the
driver's gates).

Sequencing within C12: land this **before** the platform-folder move
(`p2-architecture-platform-utils-folder.md`) — the draft patches `web/src/lib/platform.ts` by path
and stops applying once that file becomes `platform/index.ts`. The move then carries the canonical
type along, and every `from '$lib/platform'` import this patch adds survives the move unchanged, so
the two land coherently in this order with no rework.

## Suggested next step

Re-stage in `docs/AUDIT.md` as "apply the draft patch as-is, before the platform-folder move; then
rebase the effect-bodies draft per the recorded objection (import `Orientation` from
`$lib/platform`, drop its literal redeclarations)".
