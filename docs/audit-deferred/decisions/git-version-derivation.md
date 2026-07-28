# Git-based version derivation is ~35 lines of imperative logic embedded in `vite.config.ts` and is untestable there

**Original finding:** [P3][maintainability] — `web/vite.config.ts:16-49` (`git`, `webVersion`,
`PKG_VERSION`), pinned at f934d43 — deferred because it failed adversarial review after three
rounds. **Verdict:** FIX

## Context

The finding: `web/vite.config.ts` embeds the entire ADR-0030 versioning contract — a `git describe`
regex parse, a two-level try/catch fallback chain (tag → short SHA → bare package version), and
version-string assembly — inside a config module where none of it can be unit-tested. The proposed
solution was to extract it into a pure, mockable helper plus a Vitest spec covering all three
fallback branches.

The burndown attempt went three rounds:

1. Extracted only the string-formatting into `web/build/version.ts` — died twice over: the path is
   inside the gitignored `build/` output directory (imports fail in a clean checkout), and the
   extraction was partial (the `execSync` wrapper, `PKG_VERSION`/`BUILD_TIME`, and the fallback
   orchestration stayed in the config, untested).
2. Moved the helper to the non-ignored `web/buildVersion.ts`.
3. Moved the complete derivation (package-version read, build-time stamp, git execution, lazy
   describe-to-SHA orchestration) into `buildVersion.ts`, with tests covering git command order,
   lazy SHA lookup, the no-git fallback, and native builds never touching git.

Reviewer objections left unresolved after round 3 — both documentation sync, not code:

* Root `netlify.toml:12` comment still says `git describe` runs in `web/vite.config.ts`.
* ADR-0030 still states the version derivation branches inside `web/vite.config.ts`.

## Current state

Verified at HEAD 63a7aa49: the problem is fully intact. `web/vite.config.ts:21-57` still contains
`PKG_VERSION`, `BUILD_TIME`, the `git()` `execSync` wrapper, `webVersion()` with the
`/-(\d+)-g[0-9a-f]+$/` regex and both try/catch fallbacks, and the `isCapacitor` branch — none of it
covered by any test. Root `netlify.toml:12` and `docs/adrs/0030-git-derived-web-version.md:29` both
(currently correctly) point at `vite.config.ts`.

Two facts the failed review never surfaced, and which settle the design questions:

* **The destination convention already exists.** `web/defines.ts` is a root-level `.ts` module
  beside the configs, imported by both `web/vite.config.ts` and `web/vitest.config.ts` — exactly the
  shape the round-2/3 draft landed on with `web/buildVersion.ts`.
* **The test-location convention already exists too.** `web/src/lib/buildDefines.test.ts` tests the
  root-level `defines.ts` from inside `src/` (the Vitest `include` is `src/**/*.{test,spec}.{js,ts}`
  and colocated-in-`src/` is the testing rule). The draft's `web/src/lib/buildVersion.test.ts`
  matches it exactly.

So the round-3 draft is not a compromise shape — it is the repo's established shape. What failed
review was two missing one-line doc updates.

## Options considered

1. **Finish the draft** — apply the round-3 end state (`web/buildVersion.ts` +
   `web/src/lib/buildVersion.test.ts` + slimmed `vite.config.ts`), then close the two doc-sync
   objections (`netlify.toml:12` comment, ADR-0030 amendment). Pros: the hard work is done and
   verified against the objections; matches the `defines.ts` precedent; the doc syncs are one line
   each. Cons: none material. **Winner.**
2. **Minimal extraction** — extract only `webVersion()` as a pure function taking the describe
   output, leave `git()`/`PKG_VERSION`/`BUILD_TIME` in the config. Rejected: this is literally round
   1, which the reviewer correctly rejected — the fallback *orchestration* (when to run which git
   command, lazy SHA lookup, native skipping git entirely) is the logic most worth testing.
3. **DROP** — rejected: the problem is real and untouched at HEAD, the fix is ~95% complete in the
   stored patch, and the remaining cost is two comment/doc edits. Cost/benefit is clearly positive.

## Decision / lean

**FIX — finish the draft.** Concretely:

1. Apply
   `docs/audit-deferred/p3-maintainability-git-based-version-derivation-is-35-lines-of-imperativ.patch`
   (or re-create its end state): new `web/buildVersion.ts` exporting `deriveWebVersion` and
   `buildMetadata`, new `web/src/lib/buildVersion.test.ts` (`// @vitest-environment node`), and
   `web/vite.config.ts` reduced to
   `const { appVersion: APP_VERSION, buildTime: BUILD_TIME } = buildMetadata({ isCapacitor });`.
2. Root `netlify.toml:12`: change "`git describe` in `web/vite.config.ts`" to point at
   `web/buildVersion.ts`.
3. ADR-0030: amend the Decision section's opening line ("Branch the version derivation in
   `web/vite.config.ts` …", line 29) to name `web/buildVersion.ts` as the home of the derivation,
   consumed by `web/vite.config.ts`. A one-line-plus-note amendment to an Active ADR is appropriate
   here — the decision (version *semantics*) is unchanged; only the incidental file reference moved.
4. Polish (recommended, not blocking): move the ADR-0030 explanatory comment block currently at
   `web/vite.config.ts:21-30` (blobless-clone/tag-fetch rationale) into `web/buildVersion.ts` beside
   the logic it explains, leaving a one-line pointer in the config.
5. Verify per the original finding: unit tests pass for all three branches; `npm run build` on a
   tagged checkout yields `major.minor.<n>`; the draft's native test proves `CAPACITOR=true` builds
   never invoke git.

The draft's behavior was checked against the original line by line: tag-present, describe-succeeds-
but-regex-misses, no-tag, and no-git paths all produce identical output, and the native short-
circuit is preserved. The one latent quirk — `readPackageVersion()` reads `'../package.json'`
relative to cwd — is inherited verbatim from the original config (which relies on the toolchain
running with `cwd = web/` per ADR-0024) and is out of scope.

**Shared-convention note (cross-finding):** the sibling deferred finding "`CAPACITOR` single signal
re-derived in every config" died on the same `web/build/` gitignore trap. The convention both
findings should share is the one `web/defines.ts` already established: **build-time helper modules
live as root-level `.ts` files in `web/`, beside the configs that import them, tested from
`web/src/lib/*.test.ts`.** Not `scripts/lib/` (that tree serves repo tooling invoked by npm scripts,
not modules the Vite/SvelteKit config bundler imports), and never `web/build/` (gitignored output).
If the CAPACITOR finding proceeds, its `isCapacitor` export belongs in the same place (e.g. a small
`web/platform.ts`, or exported from an existing root-level module), and `buildVersion.ts` could then
consume it — but the two fixes remain independently landable.

## Why the previous attempt failed, and how this path avoids it

| Reviewer objection                                                              | Resolution                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web/build/version.ts` is gitignored; imports fail in a clean checkout          | Already fixed in draft round 2: helper lives at `web/buildVersion.ts`, matching the tracked `web/defines.ts` precedent                                                                                       |
| Config still owned `PKG_VERSION`/`BUILD_TIME`/`execSync`/fallback orchestration | Already fixed in draft round 3: `buildMetadata` owns the complete derivation; config consumes returned values, and tests cover command order, lazy SHA lookup, no-git fallback, and the native short-circuit |
| `netlify.toml:12` still points the tag-fetch rationale at `web/vite.config.ts`  | Step 2 above — one-line comment edit in the root `netlify.toml`                                                                                                                                              |
| ADR-0030 still says derivation branches inside `web/vite.config.ts`             | Step 3 above — amend the Active ADR's file reference; the decision itself is unchanged                                                                                                                       |

Neither doc objection was scope creep — both files would become actively wrong the moment the code
moves, and each costs one line. The review failed only because the implementer stopped one round
short of the doc sync.

## Implementation sketch

The stored patch is the implementation; the target end-state of the config is:

```ts
// web/vite.config.ts
import { buildMetadata } from './buildVersion';

const isCapacitor = process.env.CAPACITOR === 'true';
// Version semantics: ADR-0030; derivation + fallbacks live in ./buildVersion.ts.
const { appVersion: APP_VERSION, buildTime: BUILD_TIME } = buildMetadata({ isCapacitor });
```

with `web/buildVersion.ts` exporting pure `deriveWebVersion({ packageVersion, runGit })` (git
injected, so the three fallback branches are testable without a repo) and
`buildMetadata({ isCapacitor, ... })` as the single entry point that skips git entirely for native
builds.
