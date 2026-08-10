# ADR-0108: One `tools/` Tree for Repository Automation, Folded by Capability

**Status:** Active **Date:** 2026-08

## Context

Splotch-owned automation lived in two top-level trees with no rule separating them. `scripts/` held
219 tracked files — 30 flat entry points, a 29-module `lib/`, a 72-file `tests/`, and two full
subtrees (`perf/`, `audit-burndown/`). `tools/` held three mature packages (`asset-gen/`,
`store-drawings/`, `vectorize/`), each with its own docs, fixtures, and CLIs.

The split was subjective. Nothing distinguished `scripts/model-eval-run.mjs` — a harness with its
own fixtures, report library, input corpus, and README — from `tools/vectorize/`, except which
directory it happened to be created in. New automation had no rule to follow, so placement was
decided by whichever tree the author had open. ADR-0017 named `scripts/` as the home for shared Node
scripts but was written when they really were all one-file scripts.

Two harnesses were filed worse still: `web/tests/model-eval/` and `web/tests/redteam/` held the
corpora for manual, real-model-call harnesses that are explicitly excluded from `npm test`. Their
location inside `web/tests/` implied they were part of the automated web suite.

`scripts/lib/` had the opposite problem. It was the only library location, so it accumulated
domain-owned code — Android SDK resolution, Maestro paths, release frontmatter parsing, the admin
API client, the browser gesture driver — beside genuinely cross-cutting process and network
plumbing. Any module needed by two callers landed there, so "shared" stopped meaning anything.

Alternatives considered:

* **Keep both trees, write down the rule.** Cheapest, but the rule would have to be arbitrary — no
  honest phrasing distinguishes the two populations. Cross-file agreement maintained by prose is the
  failure mode this repository already rejects everywhere else.
* **Consolidate under `scripts/`.** The name is actively misleading for a package like `asset-gen`,
  which is a pipeline with a dependency alias file, its own architecture docs, and a test suite.
* **Introduce `tooling/`.** A third term, and no stronger distinction than the two it replaces.
* **`tools/scripts/`.** Recreates the removed split one level down.
* **Give every tool a folder with uniform `bin/`, `lib/`, `docs/`, `tests/`.** Uniform shape at the
  cost of a dozen near-empty directories around one-file tools, and it destroys the useful existing
  shapes of the mature packages.
* **npm workspaces per tool.** Rejected by ADR-0029; the root dependency tree stays singular.

## Decision

**One `tools/` tree**, folded by capability. `tools/` is broad enough to name both a one-file Node
task and a full pipeline, and it is the tree whose existing occupants already have the more
demanding shape. No tracked `scripts/` directory remains.

Placement is mechanical:

1. A capability with one executable and no owned support files stays **flat**: `tools/<name>.mjs`. A
   unit test alone does not force a folder — it can live in `tools/tests/`.
2. It earns `tools/<capability>/` on its **second entry point** or its first owned support file
   (helper, fixture, prompt, doc, sample, output).
3. Entry points keep **descriptive filenames** inside a folder: `tools/android/android-setup.mjs`,
   never `index.mjs`. The apparent redundancy is what makes a search hit, a stack frame, or a pasted
   command line self-explanatory.
4. Fold by a user-recognizable capability or an existing npm namespace. No `checks/`, `generators/`,
   or `assets/` grab bags — a shared filename prefix is not a shared domain, so `check-assets.mjs`,
   `check-netlify-cli.mjs`, `check-pwa-precache.mjs`, and `check-release-seams.mjs` all stay flat
   and unrelated.

This produced 18 capability folders (`adrs`, `android`, `api-smoke`, `app-driver`, `audit-burndown`,
`e2e-tuning`, `icons`, `lib`, `model-eval`, `native`, `page-inventory`, `perf`, `redteam`,
`release`, `ruler`, `scrapbook`, `tests`, `tokens`) alongside the three pre-existing packages and 12
flat tools.

**Libraries are owned by default, shared by exception.** `tools/lib/` is the dependency foundation
and must never import from a capability folder. Only seven modules qualified — `proc`, `net`,
`playwright`, `vite-server`, `html`, `smoke`, `book-assets` — each consumed by capabilities that
share no domain. Everything else moved into the `lib/` of its owner. A second tool may import an
owner's library across the boundary; cross-tool reuse is explicitly *not* a reason to promote a
module into `tools/lib/`, because that is how the old `scripts/lib/` lost its meaning.

**The two manual harnesses moved out of `web/tests/`** to `tools/model-eval/` and `tools/redteam/`,
carrying their READMEs and corpora. This is a filing correction only: both remain manual, remain
excluded from `npm test`, and `tools/redteam/` keeps the ADR-0023 encryption boundary — only
`encrypted/*.enc` is committed.

**The npm command catalog stays the public API** (ADR-0019). Implementation paths in `package.json`
changed; command names did not, with one exception: `test:scripts` became `test:tools`, because the
old name became affirmatively false. No compatibility alias was added — no external caller was
found.

`tools/vitest.config.mjs` discovers both the central `tests/**` drift guards and each capability's
`*/tests/**`, excluding `asset-gen` and `store-drawings`, which keep their own named suites.

## Consequences

* There is now one answer to "where does this go", and it is checkable rather than negotiated.
  ADR-0017's **location** is superseded here; its Node `.mjs`, macOS/Linux, purpose-named
  shared-helper, and process-safety rules are unchanged and still binding.
* ADR-0024's watcher boundary is unaffected — `tools/` is outside `web/`, so `netlify dev --cwd web`
  still never watches it.
* Netlify's deploy-skip filter could not simply swap `scripts` for `tools`: that would newly trigger
  rebuilds on asset-gen, store-drawings, perf, and vectorize changes, which never triggered deploys
  before. The filter now enumerates the build-relevant subpaths instead.
* knip's entry globs were redesigned rather than renamed, because entry points now exist at two
  depths. `tools/lib/` is deliberately *not* an entry, so `lint:dead` still reports dead shared
  code; it stays reachable through its importers.
* The migration touched ~370 files. Nearly all of it is renames plus path updates, but the breadth
  is the cost: workflows, hooks, permission allowlists, generated instruction trees, direct-provider
  skill packages, ignore files, and docs all encoded `scripts/`.
* Existing ADRs still say `scripts/`, and are deliberately left that way. An ADR records what was
  decided when it was written; annotating every record a rename touches turns the log into a
  changelog and costs every future reader of those records more than the stale path costs the rare
  reader who follows one. This record is the forward-facing one, reachable from the index. Two
  exceptions earn their note by carrying information a reader cannot recover from the path alone:
  ADR-0017, whose location this supersedes, and ADR-0008, whose `test:scripts` command no longer
  exists under that name.
