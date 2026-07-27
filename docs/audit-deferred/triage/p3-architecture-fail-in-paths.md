# `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**Priority/category:** P3[architecture] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/lib/paths.mjs:29-32` (now 40-43) — pinned at SHA f934d43
**Draft patch:**
docs/audit-deferred/p3-architecture-fail-console-error-process-exit-lives-in-paths-mjs-unrel.patch

## Verdict

**FIX — clear winner.** The finding has only gotten more true since it was filed (two lib modules
now also import `fail` from paths), the natural destination `lib/cli.mjs` now exists, the draft
already handles the reviewer's first objection (the legacy tool), and the second objection (dead
test stubs) is a small, well-understood two-file test change.

## Original finding (condensed)

`paths.mjs` is documented as path/tree resolution but exports the process-terminating `fail()`,
which bin scripts import *from paths*, coupling an exit side-effect to the pure constants module.
Proposed moving `fail` to `lib/cli.mjs` (or `log.mjs`) and updating the imports.

## Why it was deferred

Failed adversarial review. Two objections were recorded: (1) `legacy/retouch-line-art.mjs` still
imported `fail` from `paths.mjs` and would crash at module load — the draft's third commit fixed
exactly this, so it is resolved *within the patch*; (2) still unresolved:
`tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs` mock `paths.mjs` with a throwing
`fail` stub — after callers move to `cli.mjs`, that stub is dead and the failure-path tests would
invoke the real `process.exit(1)`.

## Current state of the code

Unresolved and slightly worse than at the pin. `fail` is still in `lib/paths.mjs:40-43`, imported by
16 `bin/` scripts, `legacy/retouch-line-art.mjs:37`, **and now also** `lib/cli.mjs:2` and
`lib/gemini.mjs:2` (both created since f934d43, both of which had to reach into paths for it).
`lib/cli.mjs` exists as the shared CLI-helper module (arg parsers, `MAX_ATTEMPTS`), so the finding's
proposed destination is no longer hypothetical — `fail` is the one CLI concern still living in the
wrong file.

The patch was staged against a near-HEAD tree; `git apply --check` fails only on
`bin/audit-golden.mjs` and `bin/audit-invented-shapes.mjs` (import-list formatting drifted since).
Everything else — all bins, legacy, `cli.mjs` gaining the definition, `gemini.mjs` re-pointing —
applies.

## Options considered

FIX, so short: the only alternative destination is a new `lib/log.mjs`, which loses to `cli.mjs` now
that `cli.mjs` exists and is already imported by most of the same bins (`fail` rides existing import
lines). Leaving `fail` in paths keeps two lib modules dependent on a `process.exit` helper from a
"pure constants" file.

## Recommendation

Apply the draft patch (hand-merging the two drifted audit-bin import lists), then make the one
change the review still demands — fix the test mocks:

* In `tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs`, delete `fail` from the
  `vi.mock('../lib/paths.mjs', …)` factories and add:

  ```js
  vi.mock('../lib/cli.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    fail(message) {
      throw new Error(message);
    },
  }));
  ```

  The `importOriginal` spread matters: `light-fill-cli.test.mjs:6` imports `MAX_ATTEMPTS` (and the
  bins import the `parse*` helpers) from the real `cli.mjs`, so only `fail` may be replaced.

Verification: `grep -rn "fail" tools/asset-gen/lib/paths.mjs` returns nothing;
`npm run
test:asset-gen` green, with the failure-path cases in both suites still observing thrown
errors (proving the new stub is live, not `process.exit`);
`node tools/asset-gen/legacy/retouch-line-art.mjs` still loads (the legacy README's "kept runnable"
contract).

## Suggested next step

Apply the patch, resolve the two import-list conflicts, add the two test-mock edits above in the
same commit.
