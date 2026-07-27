# The icon glob + `splotchy` exclusion is repeated in three places with no shared source

**Priority/category:** P2[duplication] · **Cluster:** C07 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/Icon.svelte:48`,
`web/src/lib/components/Icon.svelte.test.ts:14`, `web/src/lib/components/iconTypes.ts:4` — pinned at
SHA f934d43 **Draft patch:**
docs/audit-deferred/p2-duplication-the-icon-glob-splotchy-exclusion-is-repeated-in-three-pla.patch

## Verdict

**FIX — clear winner.** Apply the draft patch (rebasing its two conflicting `Icon.svelte` hunks over
post-pin drift), then make exactly the two one-line corrections the reviewer prescribed. The guard
machinery is proportionate, not overgrown — see below.

## Original finding (condensed)

The rule "render every icon except `splotchy`" is encoded independently as a glob literal in
`Icon.svelte` and `Icon.svelte.test.ts` and as a bare `'splotchy'` string in `iconTypes.ts`'s
`Exclude<>`. (A fourth copy the finding missed: the same glob literal in `icon-orphans.test.ts:8`.)
Excluding a second icon means updating all of them; missing one leaves `CommonIconName` admitting a
name the glob won't load — a silently blank icon at runtime. The `path → name` derivation is also
duplicated between `Icon.svelte` and its test.

## Why it was deferred

Failed adversarial review after 2 fix rounds. The two unresolved objections, both narrow:

* The new `it.each(Object.keys(globLiteralSources))` guard in `icon-orphans.test.ts` silently
  becomes a no-op if the raw-source glob resolves nothing (file rename/move, or Vite ceasing to
  resolve wildcard-free literals) — zero keys, zero cases, green suite. The reviewer prescribed the
  remedy: assert the glob resolved both files before the `it.each`.
* A comment says "`sources` above" for a declaration that sits *below* it. Remedy: say "below".

Everything else survived review: the draft passed type-check, unit tests (641, including 2 new
guards), lint, and E2E, and its guard was mutation-tested (adding a bogus `'!../icons/camera.svg'`
exclusion to `Icon.svelte` alone reddens the suite).

## Current state of the code

The finding fully holds at HEAD. All four sites are verbatim: `Icon.svelte:49`,
`Icon.svelte.test.ts:15`, `icon-orphans.test.ts:8` (glob literals) and `iconTypes.ts:4` (the
`Exclude<IconName, 'splotchy'>`). `iconNameFromPath` is still duplicated (`Icon.svelte:57` vs
`Icon.svelte.test.ts:21` vs `icon-orphans.test.ts:34`).

`Icon.svelte` drifted since f934d43 (typed `Set<CommonIconName>`, `CommonIconName` import moved to
the module script, `Props extends HTMLAttributes`, class-array syntax, `sweep-icon` removed), so
`git apply` of the patch now fails on `Icon.svelte`; `git apply -3` applies the other three files
cleanly and leaves resolvable conflicts only in `Icon.svelte`'s two hunks (an import insertion and
the `iconNameFromPath` call — neither overlaps the drift semantically). The patch's `iconTypes.ts`
comment referencing `SectionIcon.svelte`'s dispatch is still accurate at HEAD.

## Options considered

1. **Apply patch + the two prescribed fixes** (winner). All the expensive work — the
   `NON_RENDERABLE_ICONS` constant, the shared `iconNameFromPath`, the glob-differencing guard for
   `icon-orphans.test.ts`'s own literal, the source-scraping guard for the other two literals — is
   done, gate-verified, and mutation-tested. The residual objections are one assertion and one word.
2. **Patch minus the source-scraping guard** (constant + cross-linking comments only, the finding's
   own stated minimum). Rejected: it reproduces exactly the "authoritative only by comment" state
   the finding exists to close, and the drift failure mode is silent (blank icon; the orphan test
   would not catch it — an excluded icon is still referenced from `SectionIcon.svelte`). The
   reviewer's objection was that the guard could *no-op*, not that it should not exist; the fix for
   that objection is one line, so removing the guard buys nothing.
3. **DROP** — the duplication is three strings in one directory and `splotchy` has been the sole
   exclusion for the project's life. Rejected: the failure is silent when it does happen, the repo's
   culture is exactly this kind of guard test (`icon-orphans.test.ts`, the `COLOR_ICONS` chroma
   guard, `ruler:check`), and the marginal cost from here is two one-line edits.

## Recommendation

Apply the patch with `git apply -3`, resolve the two `Icon.svelte` conflicts (insert
`import { iconNameFromPath } from './iconTypes';` after the existing `HTMLAttributes` import; swap
the two-line key derivation for `icons[iconNameFromPath(path)] = src as string;`), then make the two
review fixes in `icon-orphans.test.ts`:

```ts
// Objection 1 — the guard must fail loudly if the raw-source glob stops resolving:
it('resolves both glob-literal source files', () => {
  expect(Object.keys(globLiteralSources).sort()).toEqual(['./Icon.svelte', './Icon.svelte.test.ts']);
});

it.each(Object.keys(globLiteralSources))('%s excludes exactly those icons', (path) => { ... });
```

and in the comment above `globLiteralSources`, change "`sources` above excludes" to "`sources` below
excludes" (objection 2).

Re-run the draft's own verification: `npm run check`, `npm run test:unit`, the mutation test (add a
bogus exclusion to `Icon.svelte`'s glob, confirm red, revert), plus a rename mutation for the new
assertion (rename `Icon.svelte.test.ts` mentally / temporarily and confirm the new `it` reddens).

Sequencing within C07: land this first. The P3 sibling (COLOR_ICONS generation) edits
`Icon.svelte.test.ts`, whose glob literal this guard scrapes, and the P4 sibling deletes a line the
patch's `iconTypes.ts` hunk uses as context — both are trivial on top of this, conflict-prone before
it.

## Suggested next step

Re-stage in `docs/AUDIT.md` as "apply the draft patch via 3-way merge, then make the two recorded
review fixes" — cite the objections verbatim so the implementer treats them as the acceptance
criteria. Implement before the other two C07 findings.
