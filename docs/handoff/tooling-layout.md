# Handoff — tooling layout

> 2026-08-10 · branch `agent/codex-session-transcript-analysis` · Plan the complete consolidation of
> root automation under `tools/` without implementing it

## Objective & non-goals

Create one physical home for Splotch-owned repository automation:

* replace the subjective top-level `scripts/` versus `tools/` distinction with one `tools/` tree;
* keep a single-file tool flat as `tools/<descriptive-name>.mjs`;
* give a capability a folder as soon as it owns multiple entry points or supporting domain files
  such as helpers, fixtures, prompts, docs, samples, or outputs;
* preserve descriptive entry-point filenames inside folders (`tools/android/android-setup.mjs`),
  rather than replacing them with ambiguous `index.mjs` files;
* provide one `tools/lib/` for genuinely cross-tool infrastructure while retaining tool-local `lib/`
  directories for domain-owned code;
* keep root `package.json` plus `npm run info` as the public invocation catalog.

Non-goals:

* Do **not** move implementation files as part of this handoff; this file is the plan only.
* Do not turn `tools/*` into npm workspaces or give every tool a `package.json`. The root dependency
  tree remains singular; `tools/asset-gen/package.json` remains its documented dependency-free
  local-alias exception.
* Do not standardize every mature tool on identical empty `bin/`, `lib/`, `docs/`, and `tests/`
  directories. Preserve an existing useful shape and add directories only when populated.
* Do not absorb path-owned runtime code merely because it is a script: `.ruler/skills/**`,
  `.agents/skills/**`, `.claude/skills/**`, `.claude/hooks/**`, `.claude/cloud/**`,
  `.codex/cloud/**`, `.github/scripts/**`, framework config files, Fastlane code, and native build
  wrappers stay where their owning system expects them. `docs/adrs/assets/**` also stays with its
  ADR evidence.
* Do not move runtime app source, `web/tests`, `android/`, `ios/`, generated scrapbook keepers, or
  performance outputs except for the two manual harness corpora explicitly called out below.
* Do not rename existing npm task namespaces merely because their implementation path changes. The
  one intentional command rename proposed is `test:scripts` → `test:tools`.

## State

* Branch: `agent/codex-session-transcript-analysis`
* PR: none discovered
* Starting commit: `03afd4dd8a178e48bf90b035b51468effb1e3a27`
* Working tree before this handoff: clean
* Files touched by this planning session: `docs/handoff/tooling-layout.md` only

| Commit                                   | What                                             |
| ---------------------------------------- | ------------------------------------------------ |
| 03afd4dd8a178e48bf90b035b51468effb1e3a27 | Starting point; no tooling-layout implementation |
| the commit containing this file          | Planning handoff only                            |

## Decisions made (and why)

### The umbrella is `tools/`, not `scripts/`, `tooling/`, or `tools/scripts/`

`tools/` is broad enough to contain both a one-file Node task and a full pipeline with docs,
fixtures, generated inputs, and several CLIs. `scripts/` becomes misleading for packages such as
asset-gen; `tooling/` adds a new term without a stronger distinction; `tools/scripts/` recreates the
split being removed.

This is compatible with ADR-0024's load-bearing watcher boundary because `tools/` remains outside
`web/`. It changes the placement named by ADR-0017 and needs a new ADR that amends the location
parts of ADR-0017 while preserving its Node/macOS/Linux/shared-helper rules.

### Folder by capability, not prefix or lifecycle phase

The mechanical placement rule is:

1. A capability with one executable and no owned support ecosystem starts flat at
   `tools/<name>.mjs`.
2. A unit test alone does not force a directory; it may live in `tools/tests/`.
3. Multiple entry points or domain-owned helpers/assets/fixtures/prompts/docs/samples/outputs create
   `tools/<capability>/`.
4. Entry points stay descriptively named. A folder can contain `android-setup.mjs`,
   `android-emulator.mjs`, and `android-verify.mjs`; it does not acquire `index.mjs` merely by
   becoming a folder.
5. Folder by a user-recognizable capability or existing npm namespace. Do not create generic
   `checks/`, `generators/`, or `assets/` grab bags: similarly prefixed files may own unrelated
   domains.

### One shared library, but not one universal library

`tools/lib/` is the dependency foundation. It must not import from a specific tool folder. Put a
module there only when independent capabilities consume it and no narrower domain owns it.

The seven current modules proposed for the shared library are:

| Current                       | Destination                 | Motivation                                                                   |
| ----------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `scripts/lib/proc.mjs`        | `tools/lib/proc.mjs`        | Process, root, args, and main-entry plumbing used nearly everywhere          |
| `scripts/lib/net.mjs`         | `tools/lib/net.mjs`         | Network readiness and LAN-address helpers used by unrelated tools            |
| `scripts/lib/playwright.mjs`  | `tools/lib/playwright.mjs`  | Shared browser-binary resolution                                             |
| `scripts/lib/vite-server.mjs` | `tools/lib/vite-server.mjs` | Shared throwaway-server lifecycle                                            |
| `scripts/lib/html.mjs`        | `tools/lib/html.mjs`        | Generic HTML escaping/render primitives across report producers              |
| `scripts/lib/smoke.mjs`       | `tools/lib/smoke.mjs`       | Generic pass/fail smoke reporter                                             |
| `scripts/lib/book-assets.mjs` | `tools/lib/book-assets.mjs` | Crosses the flat asset check and native-export tool; no clearer single owner |

Everything else currently in `scripts/lib/` has an owner and moves with it. A second tool may import
an owner's explicit library—for example, performance importing Android SDK resolution or a report
producer importing scrapbook chrome. Cross-tool reuse is not by itself a reason to erase ownership
into `tools/lib/`.

`tools/asset-gen` remains allowed to keep its own CLI/path/report primitives and need not import the
shared library. Its current isolation is deliberate and should not be weakened just to maximize
reuse. `tools/store-drawings` should switch its current `scripts/lib` imports to `tools/lib` and
`tools/app-driver/lib` as appropriate.

### Root npm commands remain the public API

ADR-0019's `namespace:variant` command catalog remains authoritative. Update implementation paths in
`package.json` and all `scripts-info` descriptions, but keep command names stable except:

* rename `test:scripts` to `test:tools` because the old name becomes affirmatively false;
* update the root `test` composition, docs, CI, and all prose references in the same change;
* do not retain a compatibility alias unless a real external caller is found during migration.

Ordinary Node tool tests should use `tools/vitest.config.mjs`, rooted at `tools/`, with an include
that discovers central and owner-local `**/tests/**/*.test.mjs`. Exclude `asset-gen/**` and
`store-drawings/**`, whose separately named suites/configs remain useful and already run in
`npm test`.

## Complete destination map

### Root instructions, configuration, and whole subtrees

| Current                     | Destination               | Notes                                                                       |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `scripts/.ruler/AGENTS.md`  | `tools/.ruler/AGENTS.md`  | Rewrite as the general unified-tooling orientation source                   |
| `scripts/AGENTS.md`         | `tools/AGENTS.md`         | Generated by Ruler; never move/edit directly                                |
| `scripts/CLAUDE.md`         | `tools/CLAUDE.md`         | Generated by Ruler; never move/edit directly                                |
| `scripts/vitest.config.mjs` | `tools/vitest.config.mjs` | Rename suite vocabulary from repo scripts to ordinary tools                 |
| `scripts/perf/**`           | `tools/perf/**`           | Whole subtree; retain filenames and internal organization                   |
| `scripts/audit-burndown/**` | `tools/audit-burndown/**` | Whole subtree including prompts                                             |
| `tools/asset-gen/**`        | unchanged                 | Existing mature tool; preserve nested instructions/config/package exception |
| `tools/store-drawings/**`   | unchanged                 | Existing mature tool; update imports from old shared paths                  |
| `tools/vectorize/**`        | unchanged                 | Existing tool; add its currently central test locally as mapped below       |

After verified migration, no tracked `scripts/` files should remain and the directory should
disappear. Do not attempt to move ignored `scripts/node_modules` or Vite caches; identify whether a
current process owns them, then remove the obsolete cache only after the tracked migration is
complete.

### Flat one-file tools

These remain intentionally flat under the new umbrella:

| Current                           | Destination                     |
| --------------------------------- | ------------------------------- |
| `scripts/check-assets.mjs`        | `tools/check-assets.mjs`        |
| `scripts/check-netlify-cli.mjs`   | `tools/check-netlify-cli.mjs`   |
| `scripts/check-pwa-precache.mjs`  | `tools/check-pwa-precache.mjs`  |
| `scripts/check-release-seams.mjs` | `tools/check-release-seams.mjs` |
| `scripts/cloud-tunnel.mjs`        | `tools/cloud-tunnel.mjs`        |
| `scripts/dev-kill.mjs`            | `tools/dev-kill.mjs`            |
| `scripts/gha-versions.mjs`        | `tools/gha-versions.mjs`        |
| `scripts/image-audit.mjs`         | `tools/image-audit.mjs`         |
| `scripts/open-path.mjs`           | `tools/open-path.mjs`           |
| `scripts/playwright-version.mjs`  | `tools/playwright-version.mjs`  |
| `scripts/stage-netlify.mjs`       | `tools/stage-netlify.mjs`       |
| `scripts/web.mjs`                 | `tools/web.mjs`                 |

Deliberation: `web.mjs`, Netlify checks/staging, dev-kill, and cloud-tunnel could be placed in a
`web-toolchain/` folder, but that category is too broad and would become a miscellaneous home. Leave
them flat until they develop a shared domain-specific support surface. Likewise, do not group
`check-*` files solely by prefix.

### `tools/android/`

| Current                                 | Destination                                   |
| --------------------------------------- | --------------------------------------------- |
| `scripts/android-emulator-smoke.mjs`    | `tools/android/android-emulator-smoke.mjs`    |
| `scripts/android-emulator.mjs`          | `tools/android/android-emulator.mjs`          |
| `scripts/android-open.mjs`              | `tools/android/android-open.mjs`              |
| `scripts/android-setup.mjs`             | `tools/android/android-setup.mjs`             |
| `scripts/android-verify.mjs`            | `tools/android/android-verify.mjs`            |
| `scripts/gradle.mjs`                    | `tools/android/gradle.mjs`                    |
| `scripts/lib/android.mjs`               | `tools/android/lib/android.mjs`               |
| `scripts/tests/android-config.test.mjs` | `tools/android/tests/android-config.test.mjs` |

Keep Android's descriptive prefixes during migration. `tools/android/android-setup.mjs` is redundant
in the benign sense: search results, stack traces, direct command lines, and copied paths remain
self-explanatory. Android's library stays owned here even though performance and release consume
pieces of it.

### `tools/native/`

| Current                                       | Destination                                        |
| --------------------------------------------- | -------------------------------------------------- |
| `scripts/check-native-app-id.mjs`             | `tools/native/check-native-app-id.mjs`             |
| `scripts/check-native-bundle.mjs`             | `tools/native/check-native-bundle.mjs`             |
| `scripts/strip-native-assets.mjs`             | `tools/native/strip-native-assets.mjs`             |
| `scripts/ios-simulator-smoke.mjs`             | `tools/native/ios-simulator-smoke.mjs`             |
| `scripts/lib/maestro.mjs`                     | `tools/native/lib/maestro.mjs`                     |
| `scripts/lib/native-export.mjs`               | `tools/native/lib/native-export.mjs`               |
| `scripts/lib/native-smoke.mjs`                | `tools/native/lib/native-smoke.mjs`                |
| `scripts/tests/ios-privacy-manifest.test.mjs` | `tools/native/tests/ios-privacy-manifest.test.mjs` |
| `scripts/tests/native-build-scripts.test.mjs` | `tools/native/tests/native-build-scripts.test.mjs` |
| `scripts/tests/native-bundle-guard.test.mjs`  | `tools/native/tests/native-bundle-guard.test.mjs`  |
| `scripts/tests/native-export.test.mjs`        | `tools/native/tests/native-export.test.mjs`        |

Do not create `tools/ios/` for one entry point yet. If iOS acquires several dedicated Node entry
points, promote those together later while leaving genuinely cross-platform native code here.

### `tools/release/`

| Current                                    | Destination                                      |
| ------------------------------------------ | ------------------------------------------------ |
| `scripts/release.mjs`                      | `tools/release/release.mjs`                      |
| `scripts/publish-artifacts.mjs`            | `tools/release/publish-artifacts.mjs`            |
| `scripts/generate-releases.mjs`            | `tools/release/generate-releases.mjs`            |
| `scripts/lib/artifact-version.mjs`         | `tools/release/lib/artifact-version.mjs`         |
| `scripts/lib/frontmatter.mjs`              | `tools/release/lib/frontmatter.mjs`              |
| `scripts/lib/native-version.mjs`           | `tools/release/lib/native-version.mjs`           |
| `scripts/tests/artifact-version.test.mjs`  | `tools/release/tests/artifact-version.test.mjs`  |
| `scripts/tests/frontmatter.test.mjs`       | `tools/release/tests/frontmatter.test.mjs`       |
| `scripts/tests/generate-releases.test.mjs` | `tools/release/tests/generate-releases.test.mjs` |
| `scripts/tests/native-version.test.mjs`    | `tools/release/tests/native-version.test.mjs`    |
| `scripts/tests/publish-artifacts.test.mjs` | `tools/release/tests/publish-artifacts.test.mjs` |
| `scripts/tests/release.test.mjs`           | `tools/release/tests/release.test.mjs`           |

`generate-releases.mjs` runs during builds but belongs to the release-content capability because it
shares the release source and frontmatter contract. `check-release-seams.mjs` is a production-build
guard, not release orchestration, and remains flat.

### `tools/ruler/`

| Current                                           | Destination                                           |
| ------------------------------------------------- | ----------------------------------------------------- |
| `scripts/ruler-apply.mjs`                         | `tools/ruler/ruler-apply.mjs`                         |
| `scripts/ruler-check.mjs`                         | `tools/ruler/ruler-check.mjs`                         |
| `scripts/apply-ruler-skill-forks.mjs`             | `tools/ruler/apply-ruler-skill-forks.mjs`             |
| `scripts/mirror-skill-notes.mjs`                  | `tools/ruler/mirror-skill-notes.mjs`                  |
| `scripts/direct-provider-skills.mjs`              | `tools/ruler/direct-provider-skills.mjs`              |
| `scripts/tests/direct-provider-linguist.test.mjs` | `tools/ruler/tests/direct-provider-linguist.test.mjs` |
| `scripts/tests/ruler-apply.test.mjs`              | `tools/ruler/tests/ruler-apply.test.mjs`              |
| `scripts/tests/ruler-skill-forks.test.mjs`        | `tools/ruler/tests/ruler-skill-forks.test.mjs`        |
| `scripts/tests/skill-notes.test.mjs`              | `tools/ruler/tests/skill-notes.test.mjs`              |

The direct-provider registry itself moves, but its registered provider packages remain edited in
place. Update `scripts/direct-provider-skills.mjs` references in root instructions to the new path.
Continue to update direct provider packages independently; never manufacture or synchronize a
missing provider implementation.

### `tools/app-driver/`

| Current                           | Destination                                |
| --------------------------------- | ------------------------------------------ |
| `scripts/driver-smoke.mjs`        | `tools/app-driver/driver-smoke.mjs`        |
| `scripts/gen-large-image.mjs`     | `tools/app-driver/gen-large-image.mjs`     |
| `scripts/store-shots.mjs`         | `tools/app-driver/store-shots.mjs`         |
| `scripts/assets/large-image.svg`  | `tools/app-driver/assets/large-image.svg`  |
| `scripts/lib/app-driver.mjs`      | `tools/app-driver/lib/app-driver.mjs`      |
| `scripts/lib/stroke-geometry.mjs` | `tools/app-driver/lib/stroke-geometry.mjs` |

This is one capability: drive the live app through a shared selector/gesture API to generate store
media or prove that API has not rotted. `tools/store-drawings` and `tools/perf` may import its
explicit library. Do not place this domain-heavy browser driver in the generic shared library.

### `tools/api-smoke/`

| Current                       | Destination                           |
| ----------------------------- | ------------------------------------- |
| `scripts/api-smoke.mjs`       | `tools/api-smoke/api-smoke.mjs`       |
| `scripts/blobs-smoke.mjs`     | `tools/api-smoke/blobs-smoke.mjs`     |
| `scripts/lib/adminClient.mjs` | `tools/api-smoke/lib/adminClient.mjs` |

The local HTTP-contract smoke and deployed-Blobs smoke are distinct entry points over the same
admin/API protocol. The generic smoke result formatter stays in `tools/lib/smoke.mjs`.

### `tools/adrs/`

| Current                                | Destination                               |
| -------------------------------------- | ----------------------------------------- |
| `scripts/check-adr-numbering.mjs`      | `tools/adrs/check-adr-numbering.mjs`      |
| `scripts/lib/adr-numbering.mjs`        | `tools/adrs/lib/adr-numbering.mjs`        |
| `scripts/tests/adr-numbering.test.mjs` | `tools/adrs/tests/adr-numbering.test.mjs` |

Use plural `adrs` to match `docs/adrs/` and the `check:adrs` namespace.

### `tools/icons/`

| Current                              | Destination                              |
| ------------------------------------ | ---------------------------------------- |
| `scripts/generate-icon-names.mjs`    | `tools/icons/generate-icon-names.mjs`    |
| `scripts/gen-icons-sheet.mjs`        | `tools/icons/gen-icons-sheet.mjs`        |
| `scripts/lib/iconChroma.mjs`         | `tools/icons/lib/iconChroma.mjs`         |
| `scripts/lib/iconChroma.d.mts`       | `tools/icons/lib/iconChroma.d.mts`       |
| `scripts/tests/icon-chroma.test.mjs` | `tools/icons/tests/icon-chroma.test.mjs` |

Both entry points derive products from the app icon catalog. `image-audit.mjs` remains flat because
it audits every shipped SVG rather than owning the icon catalog.

### `tools/tokens/`

| Current                           | Destination                            |
| --------------------------------- | -------------------------------------- |
| `scripts/gen-tokens.mjs`          | `tools/tokens/gen-tokens.mjs`          |
| `scripts/lint-token-styles.mjs`   | `tools/tokens/lint-token-styles.mjs`   |
| `scripts/lint-token-styles.d.mts` | `tools/tokens/lint-token-styles.d.mts` |

Generation and enforcement are the two operations over the design-token vocabulary. Keep their
current production-side tests under `web/src/lib/design/`; those test app source, not the CLI
layout.

### `tools/e2e-tuning/`

| Current                               | Destination                                    |
| ------------------------------------- | ---------------------------------------------- |
| `scripts/e2e-sweep.mjs`               | `tools/e2e-tuning/e2e-sweep.mjs`               |
| `scripts/gen-e2e-tuning-report.mjs`   | `tools/e2e-tuning/gen-e2e-tuning-report.mjs`   |
| `scripts/tests/worker-sweep.test.mjs` | `tools/e2e-tuning/tests/worker-sweep.test.mjs` |

The sweep gathers the measurements and the report preserves their interpreted result. Keep
`playwright-version.mjs` flat: it is a tiny CI cache-key helper, not part of tuning the suite.

### `tools/scrapbook/`

| Current                                         | Destination                                             |
| ----------------------------------------------- | ------------------------------------------------------- |
| `scripts/publish-scrapbook.mjs`                 | `tools/scrapbook/publish-scrapbook.mjs`                 |
| `scripts/gen-coloring-book-proof-sheet-hub.mjs` | `tools/scrapbook/gen-coloring-book-proof-sheet-hub.mjs` |
| `scripts/lib/scrapbook-chrome.mjs`              | `tools/scrapbook/lib/scrapbook-chrome.mjs`              |
| `scripts/lib/scrapbook-index.mjs`               | `tools/scrapbook/lib/scrapbook-index.mjs`               |
| `scripts/tests/scrapbook-index.test.mjs`        | `tools/scrapbook/tests/scrapbook-index.test.mjs`        |

The top-level `scrapbook/` remains committed output. This folder owns only the publishing/index/UI
implementation. Icon, E2E-tuning, model-eval, page-inventory, and performance report producers stay
with their own capabilities and import scrapbook's explicit chrome API.

### `tools/page-inventory/`

| Current                                        | Destination                                                 |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `scripts/gen-page-inventory.mjs`               | `tools/page-inventory/gen-page-inventory.mjs`               |
| `scripts/finalize-page-inventory-critique.mjs` | `tools/page-inventory/finalize-page-inventory-critique.mjs` |
| `scripts/attach-page-inventory-feedback.mjs`   | `tools/page-inventory/attach-page-inventory-feedback.mjs`   |
| `scripts/lib/page-inventory-data.mjs`          | `tools/page-inventory/lib/page-inventory-data.mjs`          |
| `scripts/lib/page-inventory-report.mjs`        | `tools/page-inventory/lib/page-inventory-report.mjs`        |
| `scripts/tests/page-inventory.test.mjs`        | `tools/page-inventory/tests/page-inventory.test.mjs`        |

Committed captures and critique remain under `scrapbook/page-inventory/`; gitignored checkpoints
remain under `.scrapbook-scratch/`. The `critique-page-inventory` skill must be updated through its
`.ruler/` source.

### `tools/model-eval/`

| Current                                      | Destination                                           |
| -------------------------------------------- | ----------------------------------------------------- |
| `scripts/model-eval-run.mjs`                 | `tools/model-eval/model-eval-run.mjs`                 |
| `scripts/model-eval-fixtures.mjs`            | `tools/model-eval/model-eval-fixtures.mjs`            |
| `scripts/model-eval-gen-inputs.mjs`          | `tools/model-eval/model-eval-gen-inputs.mjs`          |
| `scripts/lib/model-eval.mjs`                 | `tools/model-eval/lib/model-eval.mjs`                 |
| `scripts/lib/model-eval-report.mjs`          | `tools/model-eval/lib/model-eval-report.mjs`          |
| `scripts/lib/model-eval-fixture-renderer.js` | `tools/model-eval/lib/model-eval-fixture-renderer.js` |
| `scripts/tests/model-eval.test.mjs`          | `tools/model-eval/tests/model-eval.test.mjs`          |
| `web/tests/model-eval/README.md`             | `tools/model-eval/README.md`                          |
| `web/tests/model-eval/inputs/**`             | `tools/model-eval/inputs/**`                          |
| `web/tests/model-eval/output/**`             | `tools/model-eval/output/**` (still gitignored)       |

This harness is manual, uses real model calls, and is explicitly excluded from `npm test`; its
current `web/tests` location is misleading. Before moving, inventory ignored local inputs/outputs so
the migration does not strand or overwrite a developer's untracked corpus. Update `.gitignore`
negations so the committed `gen__*` inputs remain tracked at the new path.

### `tools/redteam/`

| Current                          | Destination                                     |
| -------------------------------- | ----------------------------------------------- |
| `scripts/redteam-run.mjs`        | `tools/redteam/redteam-run.mjs`                 |
| `scripts/redteam-fixtures.mjs`   | `tools/redteam/redteam-fixtures.mjs`            |
| `scripts/lib/fixtureCrypto.mjs`  | `tools/redteam/lib/fixtureCrypto.mjs`           |
| `scripts/lib/redteam-report.mjs` | `tools/redteam/lib/redteam-report.mjs`          |
| `web/tests/redteam/README.md`    | `tools/redteam/README.md`                       |
| `web/tests/redteam/encrypted/**` | `tools/redteam/encrypted/**`                    |
| `web/tests/redteam/source/**`    | `tools/redteam/source/**` (still gitignored)    |
| `web/tests/redteam/decrypted/**` | `tools/redteam/decrypted/**` (still gitignored) |
| `web/tests/redteam/output/**`    | `tools/redteam/output/**` (still gitignored)    |

The safety suite is still a manual integration test in purpose; moving it does not make it part of
the ordinary automated test tier. Preserve the encryption-key and real-call safety boundaries from
ADR-0023. Inventory ignored plaintext/decrypted/output files before moving anything.

### `tools/perf/` tests

Move the implementation subtree wholesale as stated above, and colocate these current central tests
without renaming them:

| Current                                             | Destination                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| `scripts/tests/deployment-matrix-report.test.mjs`   | `tools/perf/tests/deployment-matrix-report.test.mjs`   |
| `scripts/tests/ipad-console-driver.test.mjs`        | `tools/perf/tests/ipad-console-driver.test.mjs`        |
| `scripts/tests/perf-actions.test.mjs`               | `tools/perf/tests/perf-actions.test.mjs`               |
| `scripts/tests/perf-analyze.test.mjs`               | `tools/perf/tests/perf-analyze.test.mjs`               |
| `scripts/tests/perf-android-web-actions.test.mjs`   | `tools/perf/tests/perf-android-web-actions.test.mjs`   |
| `scripts/tests/perf-args.test.mjs`                  | `tools/perf/tests/perf-args.test.mjs`                  |
| `scripts/tests/perf-capture.test.mjs`               | `tools/perf/tests/perf-capture.test.mjs`               |
| `scripts/tests/perf-cli-inputs.test.mjs`            | `tools/perf/tests/perf-cli-inputs.test.mjs`            |
| `scripts/tests/perf-ipad.test.mjs`                  | `tools/perf/tests/perf-ipad.test.mjs`                  |
| `scripts/tests/perf-real-screen.test.mjs`           | `tools/perf/tests/perf-real-screen.test.mjs`           |
| `scripts/tests/screenshot-timing-contract.test.mjs` | `tools/perf/tests/screenshot-timing-contract.test.mjs` |
| `scripts/tests/undo-fast-set.test.mjs`              | `tools/perf/tests/undo-fast-set.test.mjs`              |
| `scripts/tests/undo-scenarios.test.mjs`             | `tools/perf/tests/undo-scenarios.test.mjs`             |
| `scripts/tests/webkit-perf-ci.test.mjs`             | `tools/perf/tests/webkit-perf-ci.test.mjs`             |

Profiling guides remain in `docs/PROFILING.md` and `docs/PROFILING-IPAD.md`; skills stay thin
routers per ADR-0107. `perf-profiles/` remains ignored output and selected keeper reports remain in
the scrapbook.

### `tools/audit-burndown/` tests

Move these current central tests into the moved subtree:

| Current                                              | Destination                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/tests/audit-burndown-agent-runner.test.mjs` | `tools/audit-burndown/tests/audit-burndown-agent-runner.test.mjs` |
| `scripts/tests/audit-burndown-comment.test.mjs`      | `tools/audit-burndown/tests/audit-burndown-comment.test.mjs`      |
| `scripts/tests/audit-burndown-lib.test.mjs`          | `tools/audit-burndown/tests/audit-burndown-lib.test.mjs`          |
| `scripts/tests/audit-burndown-overnight.test.mjs`    | `tools/audit-burndown/tests/audit-burndown-overnight.test.mjs`    |
| `scripts/tests/audit-burndown-pop.test.mjs`          | `tools/audit-burndown/tests/audit-burndown-pop.test.mjs`          |
| `scripts/tests/audit-burndown-run.test.mjs`          | `tools/audit-burndown/tests/audit-burndown-run.test.mjs`          |
| `scripts/tests/backfill-comments.test.mjs`           | `tools/audit-burndown/tests/backfill-comments.test.mjs`           |

`burn-down-audits` is a registered direct provider package. Update the Claude and Codex
implementations and their notes independently at their registered paths; do not edit a Ruler source
or copy one provider into the other. Check the existing `docs/handoff/audit-burndown-72.md` before
implementation: if it is still live, update its executable paths or consume it first rather than
leaving an active transfer packet stale.

### Existing tool tests

| Current                                   | Destination                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `scripts/tests/vectorize-driver.test.mjs` | `tools/vectorize/tests/vectorize-driver.test.mjs` |
| `tools/asset-gen/tests/**`                | unchanged                                         |
| `tools/store-drawings/tests/**`           | unchanged                                         |

### Central `tools/tests/`

The remaining tests are cross-cutting drift guards, tests of flat tools/shared infrastructure, or
tests of path-owned systems outside a tool folder. Move them without renaming:

| Current                                         | Destination                                   |
| ----------------------------------------------- | --------------------------------------------- |
| `scripts/tests/claude-cloud-setup.test.mjs`     | `tools/tests/claude-cloud-setup.test.mjs`     |
| `scripts/tests/claude-permissions.test.mjs`     | `tools/tests/claude-permissions.test.mjs`     |
| `scripts/tests/codex-transcript-tools.test.mjs` | `tools/tests/codex-transcript-tools.test.mjs` |
| `scripts/tests/compatibility-register.test.mjs` | `tools/tests/compatibility-register.test.mjs` |
| `scripts/tests/dev-kill.test.mjs`               | `tools/tests/dev-kill.test.mjs`               |
| `scripts/tests/dev-ports.test.mjs`              | `tools/tests/dev-ports.test.mjs`              |
| `scripts/tests/e2e-engine-tags.test.mjs`        | `tools/tests/e2e-engine-tags.test.mjs`        |
| `scripts/tests/e2e-harness-imports.test.mjs`    | `tools/tests/e2e-harness-imports.test.mjs`    |
| `scripts/tests/e2e-server-env.test.mjs`         | `tools/tests/e2e-server-env.test.mjs`         |
| `scripts/tests/flaky-reporter.test.mjs`         | `tools/tests/flaky-reporter.test.mjs`         |
| `scripts/tests/format-config.test.mjs`          | `tools/tests/format-config.test.mjs`          |
| `scripts/tests/issue-stack.test.mjs`            | `tools/tests/issue-stack.test.mjs`            |
| `scripts/tests/labels.test.mjs`                 | `tools/tests/labels.test.mjs`                 |
| `scripts/tests/net.test.mjs`                    | `tools/tests/net.test.mjs`                    |
| `scripts/tests/palette-source.test.mjs`         | `tools/tests/palette-source.test.mjs`         |
| `scripts/tests/playwright-config.test.mjs`      | `tools/tests/playwright-config.test.mjs`      |
| `scripts/tests/proc.test.mjs`                   | `tools/tests/proc.test.mjs`                   |
| `scripts/tests/pwa-precache.test.mjs`           | `tools/tests/pwa-precache.test.mjs`           |
| `scripts/tests/reconcile-survey.test.mjs`       | `tools/tests/reconcile-survey.test.mjs`       |
| `scripts/tests/release-seams.test.mjs`          | `tools/tests/release-seams.test.mjs`          |
| `scripts/tests/run-splotch-driver.test.mjs`     | `tools/tests/run-splotch-driver.test.mjs`     |
| `scripts/tests/scripts-info.test.mjs`           | `tools/tests/scripts-info.test.mjs`           |
| `scripts/tests/skill-doc-links.test.mjs`        | `tools/tests/skill-doc-links.test.mjs`        |
| `scripts/tests/skill-spec-citations.test.mjs`   | `tools/tests/skill-spec-citations.test.mjs`   |
| `scripts/tests/transcript-skeleton.test.mjs`    | `tools/tests/transcript-skeleton.test.mjs`    |
| `scripts/tests/vite-server-release.test.mjs`    | `tools/tests/vite-server-release.test.mjs`    |
| `scripts/tests/vite-server.test.mjs`            | `tools/tests/vite-server.test.mjs`            |
| `scripts/tests/web-root-unit-tests.test.mjs`    | `tools/tests/web-root-unit-tests.test.mjs`    |
| `scripts/tests/workflow-hygiene.test.mjs`       | `tools/tests/workflow-hygiene.test.mjs`       |

Do not create an `agent-tooling/` folder merely to house tests of several independently path-owned
agent systems. Their commonality is only that they are repo drift guards; central tests express that
accurately.

## Reference and generated-file migration

The file moves are only half the work. Use `rg`, not memory, to update every live reference.

### Must update

* `package.json`: every command path, every `scripts-info` path-bearing description, root `test`,
  and `test:scripts` → `test:tools`.
* `.gitignore`: model-eval and redteam paths/comments; any `scripts/`-rooted scratch patterns.
* `netlify.toml` and `web/netlify.toml`: build/staging and `web.mjs` paths plus comments.
* `.github/actions/**` and `.github/workflows/**`: Playwright version, worker sweep, blob smoke,
  Android constants/tests, perf seed, ADR check, comments, and path filters.
* `knip.json`/ESLint/format/dependency tooling and any config whose scope explicitly lists
  `scripts/`.
* Current human docs: `docs/CONTRIBUTING.md`, `docs/TESTING.md`, `docs/MOBILE/**`,
  `docs/PROFILING*.md`, `scrapbook/README.md`, model-eval/redteam READMEs, and other live runbooks.
* `.ruler/**` instruction and shared-skill sources. Then run `npm run ruler:apply`; do not edit
  generated `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, or ordinary `.agents/skills` directly.
* Registered direct provider packages/notes declared by the relocated
  `tools/ruler/direct-provider-skills.mjs`; update each provider independently.
* Code imports, usage strings, generated-file banners, error messages, comments with live commands,
  and tests that calculate repo roots from their old depth.
* `tools/store-drawings` imports of the current shared process/Playwright/app-driver modules.
* The asset-gen guidance that currently describes the `scripts/lib` boundary. Preserve the isolation
  rule but name the new shared path.

### ADR treatment

Create a new ADR for the unified tools tree. It should:

* amend ADR-0017's **location** while preserving its Node `.mjs`, macOS/Linux, purpose-named
  shared-helper, and process-safety rules;
* preserve ADR-0019's npm command catalog as the public surface;
* record why `tools/` won over `scripts/`, `tooling/`, and `tools/scripts/`;
* record flat-first promotion, descriptive filenames, local versus shared libraries, no workspaces,
  and the explicit path-owned-code exclusions;
* note that ADR-0024's watcher boundary remains satisfied;
* supersede the location-only parts of the asset-gen architecture record that describe `scripts/` as
  the contrasting automation home, without changing asset-gen isolation.

Do not mechanically rewrite historical ADR prose as if the old paths had always been different. Add
amendment notes to active load-bearing ADRs whose current operational guidance would otherwise
mislead, and update current guides/skills normally. Use the ADR index to decide which records need
an amendment after `rg -n 'scripts/' docs/adrs`.

## Suggested implementation sequence

The migration should be one deliberate branch and preferably one commit because intermediate states
break most npm commands. If smaller commits are necessary, each should at least keep its touched
commands/tests runnable.

1. Create the new ADR and `tools/README.md` placement policy; add `tools/.ruler/AGENTS.md` source.
2. Move the foundation first: `scripts/lib` assignments, `scripts/vitest.config.mjs`, and root
   instructions. Update imports mechanically but do not run tools until entry points move.
3. Move each capability folder and its local tests/corpora; move flat tools last; remove the now
   empty tracked `scripts/` tree.
4. Update `package.json`, configs, ignores, workflows, current docs, `.ruler` sources, and direct
   provider packages; run `npm run ruler:apply` only after source paths are correct.
5. Run an exhaustive stale-path audit and the verification matrix below. Fix path-sensitive tests
   rather than weakening them.
6. Commit the structural migration, then independently review the diff for accidental content
   changes versus pure renames/import/path updates.

## Unverified assumptions

* No external automation outside this repository directly invokes `node scripts/...`; root npm
  commands are believed to be the only supported public interface. Search can prove only in-repo
  callers. If external consumers exist, decide explicitly whether to accept the break or provide
  temporary shims.
* A single ordinary `tools/vitest.config.mjs` with owner-local test discovery will preserve current
  execution semantics. This was not prototyped; Vitest root-relative fixtures and mocks may expose
  hidden assumptions.
* No ignored local model-eval or redteam inputs/outputs need manual preservation. They were not
  enumerated because ignored/private content should not be printed into the handoff.
* `tools/android/` plus `tools/native/` is the right split. The alternative `tools/native/android/`
  was considered but rejected provisionally as needless nesting while iOS has only one Node entry
  point.
* Keeping `book-assets.mjs` in shared `tools/lib/` is the least-bad ownership choice. A future
  coloring-book distribution tool could become its owner.
* `check-release-seams.mjs` and its test should remain flat/central rather than move into release;
  it runs on every production build and does not participate in cutting a version.
* The current branch name is unrelated to this plan, but it was the active clean branch when the
  handoff was created. The resuming session should decide whether to branch from it or create a
  dedicated tooling-layout branch before implementation.
* Existing active handoff `docs/handoff/audit-burndown-72.md` may still be live. Its state was not
  audited during this planning-only task.

## Done & verified

Read-only inventory completed against the current checkout:

* enumerated every tracked file under `scripts/` and `tools/`;
* enumerated every root npm command that invokes those paths;
* built the local import-consumer map for all 29 current `scripts/lib` modules;
* assigned every root entry point, all 29 library files, `scripts/assets`, both complex subtrees,
  root instructions/config, and all 72 `scripts/tests` files to a destination above;
* inspected `.gitignore`, Netlify configs, GitHub Actions, current docs/skills references, and
  executable-looking files outside `scripts/`/`tools/` to define the migration boundary;
* verified the working tree was clean before creating this handoff.

No implementation or validation command was run because the user explicitly requested a plan and no
file moves. The mapping itself still needs a coverage script before implementation.

## Risks & next 3 steps

Risks:

* Path churn is broad: package commands, workflows, skills, direct provider packages, generated
  instructions, docs, tests, comments, banners, ignored corpora, and root calculations all encode
  `scripts/`.
* A naïve move of ignored model-eval/redteam directories could lose local-only fixtures or outputs.
* A naïve global replacement would corrupt historical prose, provider-generated files, unrelated
  path-owned scripts, and references where `scripts` means npm's JSON property rather than the
  directory.
* Moving tests changes `import.meta.dirname` depth and fixture paths even when imports are updated.
* `tools/lib` could become a new grab bag unless the ownership/promotion rule is enforced.

Next three steps:

1. Resume this handoff, verify every unverified assumption, and generate a machine-checked old→new
   manifest from the tables before moving files. Confirm all tracked `scripts/**` paths appear
   exactly once and inspect ignored model-eval/redteam state without exposing its contents.
2. Create a dedicated branch and the new ADR/`tools/README.md`, then perform the moves and reference
   updates in the suggested sequence. Preserve Git rename detection and existing user changes.
3. Run the full verification matrix and a final `rg` stale-path audit; only then commit/push the
   structural migration and consume/delete this handoff.

## Verification matrix for the implementing session

At minimum:

```bash
npm run ruler:check
npm run format:check
npm run lint
npm run lint:dead
npm run check
npm run test:tools
npm run test:asset-gen
npm run test:store-drawings
npm run check:assets
npm run check:assets:manifest
npm run gen:tokens:check
npm run scrapbook:check
npm run img:audit:check
```

Then run targeted no-network CLI checks for moved entry points where safe (`--help`, `--check`,
`--dry-run`, or focused tests). Do not run paid/network/device/destructive workflows merely to prove
paths: model eval, redteam, vectorize production mode, release publishing, audit burndown,
physical-device profiling, Android/iOS installs, and live Blob mutation require their existing
workflow-specific authority and prerequisites.

Final audits:

```bash
git ls-files scripts
rg -n 'scripts/' package.json .gitignore netlify.toml web .github .ruler .agents .claude docs tools scrapbook
npm run info
git status --short
git diff --stat
git diff --summary
```

`git ls-files scripts` should be empty. Classify every remaining `scripts/` text match rather than
blindly forcing zero: historical ADR prose, npm's `scripts` property, provider-owned nested
`scripts/` directories, and this consumed handoff can be legitimate.

## Reread first

* [`AGENTS.md`](../../AGENTS.md) — root conventions, especially generated instructions, direct
  provider packages, commands, and cross-file drift guards.
* [`scripts/.ruler/AGENTS.md`](../../scripts/.ruler/AGENTS.md) — current automation rules that must
  become the `tools/` orientation source.
* [`docs/adrs/README.md`](../adrs/README.md) — authoritative ADR index before drafting the new
  decision.
* [ADR-0017](../adrs/0017-cross-platform-node-scripts.md) — shared Node-script structure being
  relocated, not discarded.
* [ADR-0019](../adrs/0019-npm-script-naming-and-scripts-info.md) — npm command catalog remains the
  public invocation surface.
* [ADR-0024](../adrs/0024-web-app-subdirectory-for-netlify-watcher.md) — tooling must remain outside
  the Netlify dev watch root.
* [ADR-0029](../adrs/0029-npm-as-package-manager.md) — do not introduce workspaces or nested
  dependency installs.
* [Asset-gen architecture](../../tools/asset-gen/docs/architecture.md) — preserve the plain-folder,
  root-dependency, independently scoped pipeline decisions while amending the old contrast with
  `scripts/`.
* [`package.json`](../../package.json) — command paths and `scripts-info` catalog.
* [`docs/TESTING.md`](../TESTING.md) — test-tier names and CI composition.
* [`docs/MOBILE/android.md`](../MOBILE/android.md) and
  [`docs/MOBILE/native.md`](../MOBILE/native.md) — Android/native command and toolchain paths.
* [`docs/PROFILING.md`](../PROFILING.md) and [`docs/PROFILING-IPAD.md`](../PROFILING-IPAD.md) —
  performance path surface.
* [`scripts/direct-provider-skills.mjs`](../../scripts/direct-provider-skills.mjs) — authoritative
  direct-provider registry before it moves.
* `create-adr`, `architecture`, `adrs`, `mobile`, `testing`, and `update-adrs` skills as their
  descriptions apply during implementation.
