# Three different SSR-guard idioms across the state modules

**Original finding:** [P4][Maintainability] — `web/src/lib/state/appearance.svelte.ts`,
`settings.svelte.ts`, `saveFolder.svelte.ts` @ 9ae62ff1 — deferred because implementation failed
**Verdict:** DROP (unification), with the stale doc claims fixed in the same commit

## Context

The finding: `lib/state/` gates client-only work three ways — `browser` from `$app/environment`
(`layout`, `network`, `fullscreen`, `install`), `typeof window === 'undefined'` (`settings`,
`saveFolder`), and `typeof matchMedia`/`typeof document` probes (`appearance`) — while the `web/src`
orientation doc claimed the stores self-initialize "gated on `browser`" and listed
`appearance.svelte.ts` as an example. Proposed: standardize all five spots on `browser`, adding
`vi.mock('$app/environment', () => ({ browser: true }))` to `appearance.svelte.test.ts` and
`settings.svelte.test.ts`, which the finding predicted would otherwise break because "under Vitest …
`browser` may be `false`".

## Current state

Verified at HEAD:

* The three spellings exist exactly as described (`appearance.svelte.ts:19,51`,
  `settings.svelte.ts:26,280`, `saveFolder.svelte.ts:83`; `browser` in the four listener stores).
* The finding's central test-churn premise is **false**: an empirical probe (a throwaway test
  importing `browser` from `$app/environment`) shows `browser === true` under this repo's Vitest
  config — in the happy-dom environment **and** in `@vitest-environment node` files, where `typeof
  window` is simultaneously `undefined`. Unifying would not have needed the mocks; the existing
  mocks in `layout`/`install`/`fullscreen` tests pin determinism rather than flip a false value.
* That same probe is the load-bearing reason the idioms are not interchangeable: under Vitest,
  `browser` is a compile-time constant, not an environment probe. A `typeof` guard is the only
  spelling that actually tracks the runtime a test file selected. `appearance.svelte.test.ts` and
  `settings.svelte.test.ts` import the real modules with no `$app/environment` mock and exercise
  their import-time side effects against happy-dom globals the tests install first — the probes are
  doing real work there.
* `saveFolder.svelte.ts`'s spelling is already documented as deliberate by its drift guard
  (`saveFolder.svelte.test.ts`), whose `hasSsrGuard` accepts **either** spelling at both sites: the
  inline copy of `folderSaveSupported` exists so the startup-path module imports nothing across the
  bundle boundary (root `CLAUDE.md`, ADR-referenced; pinned by `web/tests/startup-bundle.spec.ts`),
  and a `typeof window` probe needs no import. The comment's old phrasing ("imports `browser` …
  which saveFolder.svelte.ts cannot afford") overstated it — an `$app/environment` import is
  harmless bundle-wise (`layout.svelte.ts` is on the startup path and imports it) — and is corrected
  in this commit.

## Options considered

1. **Unify on `browser` (the finding's proposal).** Zero production delta — in a real build the
   spellings agree everywhere. Cost: churn in two test files' assumptions, rewriting the saveFolder
   drift-guard rationale, and a latent hazard: any future `@vitest-environment node` file that
   transitively imports one of these modules meets `browser === true` with no `window`, turning a
   silent no-op into an import-time crash. No lint rule would hold the unification, so it drifts
   back. Rejected.
2. **Unify on `typeof` probes.** Loses static DCE of client-only code from the server bundle in the
   four listener stores and fights the dominant SvelteKit idiom used across `lib/` (`storage.ts`,
   `platform/`, `idb.ts`, …). Rejected.
3. **Keep both idioms, fix the false doc claims (chosen).** The orientation doc's actual point is
   self-initialization at module load vs an exported `initX()` — the guard spelling was incidental
   phrasing that happened to be wrong for one of its own examples.

## Decision / lean

DROP the unification. The split is a coherent local rule, now stated in `web/src/.ruler/AGENTS.md`
(regenerated into `web/src/CLAUDE.md`/`AGENTS.md`): `browser` for SvelteKit-idiomatic module-load
gating where static server-side DCE matters; a `typeof` probe of the exact global about to be
dereferenced where the module's tests exercise real import-time behavior without mocking
`$app/environment`, or where the guard must not add an import (`saveFolder`'s bundle-boundary inline
copy). The saveFolder drift-guard comment is reworded to state the true constraint.

## Why the previous attempt failed, and how this path avoids it

The burndown implementation attempt failed outright (no recorded reviewer objections). Its likely
trap is now measured: the proposal's own gotcha note mispredicted Vitest behavior, and a faithful
implementation would have either added dead mocks or tripped over the saveFolder drift guard's
documented intent. This path removes the only real defect — the doc/code disagreement — without
touching behavior.
