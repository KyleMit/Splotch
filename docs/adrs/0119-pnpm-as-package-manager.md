# ADR-0119: pnpm as the Package Manager, with a Hoisted node_modules for Capacitor

**Status:** Active — supersedes [ADR-0029](0029-npm-as-package-manager.md)\
**Date:** 2026-08

## Context

[ADR-0029](0029-npm-as-package-manager.md) chose npm in 2026-06 and named the reason a future
contributor would reach past it: install speed. It rejected pnpm on one specific ground — "its
default symlinked `node_modules` is a known Capacitor footgun: `cap sync` reads plugins out of a
flat tree, so pnpm needs `node-linker=hoisted`, which gives back much of the speed/disk advantage."

Two things changed. The repo moved to a **worktree-per-task** flow — 35 worktrees were live on the
development machine while this was written — which turns per-worktree install cost from a rounding
error into the dominant one. And Capacitor moved from 6 to 8, so the footgun deserved a re-test
rather than a citation.

The re-test (pnpm 11.22.0, macOS/APFS, warm caches) found ADR-0029 **right about the constraint and
wrong about its price**.

### The Capacitor constraint is real, in a subtler form

`cap sync` finds all 8 plugins for both platforms under the default symlinked layout — the failure
ADR-0029 predicted does not happen. What happens instead is that Capacitor resolves each plugin to
its **real** path and writes that path into two files that are **committed**:

* `android/capacitor.settings.gradle` — a `projectDir` per plugin, read by Gradle
* `ios/App/CapApp-SPM/Package.swift` — a local SPM package path per plugin

Under the symlinked layout those become
`node_modules/.pnpm/@capacitor+device@8.0.3_@capacitor+core@8.4.2/node_modules/@capacitor/device/android`
— content-addressed, and stamped with both the package version and a hash of its resolved peers. So
every Capacitor bump rewrites both files, and a copy that is even one bump stale points Gradle and
Xcode at a directory that no longer exists. It is deterministic, not broken; it is just churn on
generated-but-committed native config, on the path to two app stores.

### Its price is not what ADR-0029 assumed

`nodeLinker: hoisted` produces the same flat tree npm does, and both committed files come back
byte-identical to the npm era. Measured against npm on the same machine, with both caches warm:

|                               | npm    | pnpm (hoisted) |
| ----------------------------- | ------ | -------------- |
| Install into a fresh worktree | 2.9s   | 2.3s           |
| Physical disk per worktree    | 477 MB | 17 MB          |

Disk is measured as a free-space delta, not with `du`: pnpm imports from its store with APFS clones,
which share blocks, and `du` reports ~454 MB for both layouts because it cannot see that sharing.
The store is a one-time 431 MB. So the flow that motivated the change costs ~16 GB across 35
worktrees under npm and roughly 1 GB under pnpm.

The install-time column is far less dramatic than the Linux-container figures that opened the case
(16.0s vs 1.9s). That gap is real on CI, where the cache is colder and the filesystem does not
reflink; on this Mac it is under a second. **Disk is the win. Speed is a rounding error locally and
a real one in CI.**

Hoisted gives up pnpm's strict dependency isolation, which is a genuine loss — the migration's
strictness surfaced exactly one phantom dependency (`netlify/tsconfig.json` declared
`"types": ["node"]` while `@types/node` was never a declared dependency; npm hoisted a transitive
copy and the type-check resolved it by accident). That bug is fixed by declaring it, and it stays
fixed; what is given up is the guarantee against the *next* one.

## Decision

**pnpm**, with `pnpm-lock.yaml` as the single lockfile and `nodeLinker: hoisted`.

* `packageManager` in `package.json` pins the exact version. `corepack enable pnpm` provisions it
  locally, `corepack install` in the cloud setup scripts, `pnpm/action-setup` in CI — all three read
  that one field, so no environment can drift onto a different pnpm.
* `pnpm install --frozen-lockfile` in CI and cloud bootstrap; `pnpm install` locally.
* Netlify: `PNPM_FLAGS = "--prod"`, replacing `NPM_FLAGS = "--omit=dev …"`. The
  [ADR-0070](0070-netlify-build-minute-reduction.md) inverted `dependencies`/`devDependencies` split
  is unchanged and still halves the deploy install.
* **From pnpm 11, settings live in `pnpm-workspace.yaml`, not a `pnpm` field in `package.json`.**
  The file exists for that reason alone; there is deliberately no `packages:` key, because this is
  still a single package.
* **The `npm run` script graph is unchanged.** Both `npm run` and `pnpm run` execute this
  `package.json`'s scripts against a pnpm tree, pre/post hooks included, so
  [ADR-0019](0019-npm-script-naming-and-scripts-info.md)'s vocabulary and every `npm run …` in the
  docs stay correct. npm is no longer allowed to *install* — that would author a competing
  `package-lock.json` — which is why `tools/release/cut-release.mjs` bumps with `pnpm version`
  (`npm version` syncs the lockfile it expects to find) and why the Claude Code permission allowlist
  drops `npm install`/`npm ci`.

Carried forward from ADR-0029, unchanged and still load-bearing:

* **One root `package.json`, no workspaces**, serving both `web/` and the native trees (ADR-0024).
  This is now the reason for `nodeLinker: hoisted` rather than a reason to avoid pnpm.
* The root `deno.lock` is **not** a package-manager choice — Netlify's Edge Functions bundler
  generates it. Leave it.

### Install scripts are gated, and the gate is adopted rather than defeated

pnpm runs no dependency's install script unless `pnpm-workspace.yaml`'s `allowBuilds` names it, and
it **fails the install** rather than silently skipping one it has no verdict for. All four
candidates (`@google/genai`, `esbuild`, `dprint`, `protobufjs`) are recorded as `false` with the
reason and the command that proves each is inert — every one either ships prebuilt platform binaries
through `optionalDependencies` or has a script that does nothing for a registry install.

This is a real supply-chain improvement over npm, where the same four ran unreviewed. It also
retires a workaround: the SessionStart hook's `--ignore-scripts` fallback existed because
`@capacitor/assets`' sharp 0.32 downloads libvips from GitHub releases and 403s through the cloud
egress proxy. No install script runs at all now, so the failure mode is gone rather than caught.

### The sharp override is duplicated on purpose

`@capacitor/assets>sharp` is pinned to the same range `package.json` declares for `sharp`, written
out literally in both places. pnpm's `$sharp` back-reference would keep one source of truth but is
deprecated in pnpm 11 and prints a warning on *every* pnpm invocation; the `catalog:` protocol it
recommends instead would move the range out of `package.json`, which is where Dependabot reads it,
and catalog updates are
[reported unreliable](https://github.com/dependabot/dependabot-core/issues/11953). Per the repo's
own convention, duplication that cannot be shared gets a drift guard rather than a comment:
`tools/tests/pnpm-overrides.test.mjs` fails when the two ranges diverge.

## Consequences

* \+ **~28× less disk per worktree** (17 MB vs 477 MB), which is the whole point at 35 live
  worktrees.
* \+ Faster installs, mostly on CI. Locally the margin is under a second.
* \+ Install scripts are default-denied and individually reviewed, with the reviewed list committed.
* \+ `packageManager` makes the manager version unforgeable across local/CI/cloud, retiring the
  `npm@11` pins that three bootstrap scripts carried and the lockfile-dialect churn they existed to
  prevent.
* − **Strict dependency isolation is forfeited** by `nodeLinker: hoisted`. An undeclared transitive
  import still resolves, exactly as under npm. The Capacitor native config is worth more than the
  guarantee; if `cap sync` ever emits relative or symlink-preserving paths, revisit the linker
  first.
* − pnpm is no longer bundled with Node the way npm is. It is one `corepack enable pnpm` on a fresh
  machine, and README/CONTRIBUTING lead with it, but it is a step that did not exist before.
* − Dependabot covers pnpm lockfiles under the existing `npm` ecosystem config with no config
  change, but its open PRs at migration time carry `package-lock.json` edits and must be
  regenerated.
* − `pnpm audit` replaces `npm audit` in the Quality gate. It reports the same advisories keyed by
  dependency path rather than by tree position, so the counts in a dated `docs/DEPENDENCIES.md`
  audit summary will not line up with a fresh run.
* The exit is still cheap and is unchanged from ADR-0029's reasoning in reverse: `package.json` is
  untouched by the manager choice. Regenerate `package-lock.json`, revert the config lines, and move
  `pnpm-workspace.yaml`'s two overrides back.
