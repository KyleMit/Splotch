# ADR-0070: Netlify Build-Minute Reduction — Inverted Dependency Split + Build Ignore Rule

**Status:** Active **Date:** 2026-07

## Context

Netlify build minutes were running out. Profiling showed the build command itself is cheap (~20s:
sync + prebuild ~3s, vite client 4.5s, vite SSR + adapter + PWA precache 15s, staging copy 0.1s) —
the minutes go to per-build platform overhead multiplied by build count:

* **Install/cache overhead.** The single root `package.json` (ADR-0024 — Capacitor needs it at the
  root) carries every toolchain: Playwright, dprint, sharp, SVGO, eslint/prettier, ruler, the
  Capacitor CLIs. A full install is 1,159 packages / 512 MB, all restored and re-saved from
  Netlify's build cache on every deploy — yet the web build itself needs none of that tooling.
* **Build count.** Every push to `main` deploys. Measured over 30 days: 13 of 67 production pushes
  touched nothing the web build consumes (docs, ADRs, ruler-generated agent files, `artifacts/` (now
  `scrapbook/`), native trees) and still burned a full build.

Alternatives considered:

* **Move heavy tooling to `devDependencies`** — it already is there. Netlify installs
  devDependencies because the build tools (vite, SvelteKit, the adapter) also live there, so the
  group can't be omitted as-is.
* **npm workspaces** (split tooling into `tools/asset-gen/package.json` etc.) — trims the same fat
  but restructures the install tree that ADR-0024 deliberately keeps single-rooted, and touches
  every script's resolution path. Far more invasive for the same win.
* **Build on GitHub Actions + `netlify deploy --prebuilt`** — eliminates Netlify build minutes
  entirely (public repo, free Actions minutes). Deliberately deferred, not rejected: it moves deploy
  logs/secrets to GitHub and can be layered on later; the two measures below were enough.

## Decision

Two measures, both in the root `netlify.toml`:

**1. Inverted dependency split.** In the root `package.json`, the groups are repurposed (this is an
app, not a published package — nothing consumes the split, so it is free to redefine):

* `dependencies` == what the **Netlify web build** needs: the app's runtime imports plus `vite`,
  `svelte`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`, `@sveltejs/adapter-netlify`,
  `vite-plugin-pwa`, and `marked` (the one package the `gen:icons`/`gen:releases` prebuild scripts
  import).
* `devDependencies` == local/CI-only tooling: Playwright, dprint, sharp, SVGO, eslint, prettier,
  ruler, svelte-check, typescript, vitest, happy-dom — and the Capacitor CLIs (`@capacitor/cli`,
  `@capacitor/android`, `@capacitor/ios`), which only `cap`/Gradle/Xcode workflows use. The
  Capacitor packages the app code imports (`@capacitor/core` + plugins) stay in `dependencies`.

Netlify installs with `NPM_FLAGS = "--omit=dev --no-audit --no-fund"` (`netlify.toml`
`[build.environment]`), halving the install: 577 packages / 253 MB vs 1,159 / 512 MB — and halving
the build cache that gets restored/saved each deploy. GitHub Actions (`test.yml`) and local dev run
a plain `npm ci` and get everything, unchanged.

**The invariant:** when adding a dependency, ask "does the Netlify web build import or execute
this?" Yes → `dependencies`; no → `devDependencies`. A mislabel in the needed-at-build direction
fails the deploy loudly (missing module); the other direction just installs something extra.

**2. Build ignore rule.** `[build] ignore` skips the deploy when the push touched none of the paths
the build consumes:

```
git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- web scripts releases package.json package-lock.json netlify.toml
```

The watched set is exactly what the build reads: the app (`web/`), the build + prebuild scripts
(`scripts/`), `gen:releases` input (`releases/`), the toolchain (`package.json` + lockfile), and the
deploy config itself. A skipped push leaves the previous deploy live — correct, since nothing
user-facing changed. (The auto-derived `version.json` patch number then lags `main` by the skipped
commits until the next real build; that's fine — the PWA stuck-client recovery only needs the
version to move when the app actually changes.)

## Consequences

* \+ Roughly 20% of production deploys (measured 13/67 over 30 days) skip entirely, at zero risk.
* \+ Each remaining build installs and caches half as much (253 MB vs 512 MB, 577 vs 1,159
  packages); verified end-to-end: `npm ci --omit=dev` + the full Netlify build command succeed.
* \+ Local dev, GitHub Actions CI, and native builds are untouched — plain `npm ci` still installs
  both groups.
* − `dependencies` no longer means "runtime imports" — `vite` in `dependencies` looks wrong to
  anyone carrying the npm-library convention. The split is documented here and in
  `docs/CONTRIBUTING.md`; the cost is one extra thought per new dependency.
* − A build-needed package mislabeled into `devDependencies` breaks only the Netlify deploy — CI
  stays green because Actions installs everything. The failure is loud and the fix is a one-line
  move, but it surfaces post-merge.
* − The ignore rule's watched-path list must track reality: if the build ever starts reading a new
  top-level path (e.g. a new generator input dir), that path must be added or its changes silently
  won't deploy.
