# `CAPACITOR` "single signal" re-derived in every config

**Original finding:** [P3][consistency] — `web/vite.config.ts`, `web/svelte.config.js`,
`web/vitest.config.ts` — deferred because the implementer failed to deliver a fix round (the one
draft died on the `web/build/` gitignore trap). **Verdict:** DROP

## Context

The finding: `CLAUDE.md` calls `CAPACITOR=true` "the single signal" for web-vs-native branching, yet
the parsing expression `process.env.CAPACITOR === 'true'` is duplicated in `web/vite.config.ts` and
`web/svelte.config.js`, while `web/vitest.config.ts` hardcodes `isCapacitor: true` with its own
inline rationale. Claimed risk: one site could someday use a laxer comparison (e.g.
`Boolean(process.env.CAPACITOR)`, truthy for `"false"`). Proposed: a shared module at
`web/build/platform.ts`/`.mjs` exporting `isCapacitor`.

There were no substantive reviewer objections on record — the burndown round simply failed to
deliver. The rolled-back draft
(`docs/audit-deferred/p3-consistency-the-capacitor-single-signal-is-re-derived-independently-i.patch`)
shows why: the finding's suggested path `web/build/` is inside the repo-wide gitignored `build/`
output directory, so the draft added narrow un-ignore exceptions (`!web/build/platform.mjs`,
`!web/build/platform.d.mts`) to track source files inside build output — a fragile arrangement
(native builds may clear that directory; every future file there needs its own exception) that the
sibling `git-version-derivation` draft also died on.

## Current state

Verified at HEAD 63a7aa49 — the duplication exists exactly as described, no more and no less:

* `web/vite.config.ts:10` — `const isCapacitor = process.env.CAPACITOR === 'true';` (gates the PWA
  plugin, `NATIVE_API_BASE`, and the version-derivation branch; feeds `buildDefines`).
* `web/svelte.config.js:10` — the identical line (selects `adapter-static` vs `adapter-netlify`).
* `web/vitest.config.ts:19` — `isCapacitor: true` hardcoded into `buildDefines`, with a comment
  explaining it deliberately keeps native branches compiled in so tests control the split via
  runtime `isNative()` mocks. This is an intentional override, not a re-derivation, and no fix
  touches it.
* The only *producers* are two npm scripts (`dev:cap`, `build:cap` set `CAPACITOR=true`). No other
  file parses the variable.

So the entire problem is one duplicated one-line expression across two config files, each preceded
by a site-specific comment explaining what the flag controls there. The two lines have never
diverged.

## Options considered

### Option A — DROP (chosen)

Leave both one-liners in place.

* The finding partially misreads `CLAUDE.md`. "The single signal" means the `CAPACITOR` env var is
  the single *input* for all web-vs-native branching — as opposed to scattering runtime platform
  checks — not that its parsing must occur in exactly one module. That architectural promise holds
  at HEAD.
* The guarded-against bug is doubly hypothetical. Nobody has ever written the laxer comparison here,
  and even `Boolean(process.env.CAPACITOR)` only misbehaves when someone explicitly sets
  `CAPACITOR=false` (unset → falsy → correct; `'true'` → correct). And a wrong `isCapacitor` in
  either config is loudly self-announcing: wrong adapter, missing PWA/service worker, wrong API base
  — any build or E2E run catches it immediately.
* The fix is not free (see Option B): two new files, import churn in both configs, and a manual
  `.d.mts`-to-`.mjs` sync obligation, all to replace two stable, commented one-liners. Net LOC is
  roughly a wash; net indirection is strictly worse. For a P3 consistency nit with exactly two call
  sites, the cost/benefit is negative.
* Even after Option B, the "signal" still has a deliberate third site (the vitest hardcode), so the
  aesthetic goal — `git grep "CAPACITOR === 'true'"` returns one hit — buys less unification than it
  sounds like.

### Option B — minimal shared module at the `web/` root (the fallback if the owner disagrees)

`web/platform.mjs` + `web/platform.d.mts`, imported by both configs; vitest untouched; **no
gitignore changes** (the `web/` root is not ignored — `web/defines.ts` already lives there tracked).

```js
// web/platform.mjs — .mjs, not .ts: svelte.config.js is dynamically imported by
// plain Node (SvelteKit's load_config and the Svelte language server), with no
// bundler in the loop. Node only strips types by default from 22.18; the
// engines floor is >=22.13, so a .ts import from svelte.config.js can break.
export const isCapacitor = process.env.CAPACITOR === 'true';
```

```ts
// web/platform.d.mts — required because web/tsconfig.json sets allowJs: false,
// so vite.config.ts cannot import an untyped .mjs without a declaration.
export declare const isCapacitor: boolean;
```

Pros: makes the parsing literally single; clean home; resolves the draft's gitignore fragility
outright. Cons: +2 files and a declaration to keep in sync, one boolean hidden behind an import hop,
and the per-site explanatory comments (what the flag *controls* in each config) must stay at the
call sites anyway — so the module centralizes only the trivial part.

The file-format constraint above is the non-obvious core of any fix and is why the draft's shape
(`.mjs` + `.d.mts`) was right even though its location was wrong.

### Option C — fold `isCapacitor` into a shared build-env module with the version helper

The sibling `git-version-derivation` finding extracts version logic to a `web/`-root module (its
round-2/3 path was `web/buildVersion.ts`). Hosting both there sounds tidy but the constraints
conflict: the version helper wants to be **`.ts`** (unit-tested by Vitest, imported only by
`vite.config.ts`, which bundles TS natively), while the platform signal must be **`.mjs`** so
`svelte.config.js` can import it (Option B's reasoning). Merging forces either the version module
down to `.mjs` + hand-written declarations (worse for its tests and types) or `svelte.config.js`
onto a `.ts` import (fragile below Node 22.18). They should stay separate; no synergy changes the
Option A calculus.

## Decision / lean

**DROP.** Two identical, stable, well-commented one-liners plus one deliberate test override do not
justify two new files and permanent indirection. The CLAUDE.md "single signal" promise is about the
env var being the sole branching input, and that is intact at HEAD. If the owner still wants the
literal single parse site, Option B is the complete, reviewed-shape recipe — implement it exactly as
sketched (web/ root, `.mjs` + `.d.mts`, vitest untouched, no gitignore edits) and do not merge it
with the version-derivation module (Option C explains why).

## Why the previous attempt failed, and how this path avoids it

* **Failure: the `web/build/` gitignore trap.** The finding itself proposed `web/build/platform.ts`
  and the draft complied, adding un-ignore exceptions to track source inside ignored build output.
  DROP moots it entirely; Option B places the module at the non-ignored `web/` root, matching where
  `web/defines.ts` already lives and where the sibling finding's later rounds also landed.
* **No other reviewer objections existed** ("implementer failed to deliver a fix round"), so nothing
  else needs resolving. The deliberate vitest hardcode was never in scope for any round and stays
  out of scope here.
