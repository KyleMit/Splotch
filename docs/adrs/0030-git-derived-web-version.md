# ADR-0030: Git-Derived Per-Commit Web Version

**Status:** Active
**Date:** 2026-06

## Context

`package.json` holds the canonical semver, bumped only by `scripts/release.mjs`
(ADR-0010 injects it as the `__APP_VERSION__` build constant; the About tab shows
it and `web/src/lib/pwa/updates.ts` compares it against `/version.json`). That
cadence is driven by the **native** apps: an Android/iOS release must be
explicitly versioned, bundled, uploaded, reviewed, and published, so the version
moves a few times a month at most.

The **web** target deploys on every push to `main` (Netlify, ADR-0024). Tying
its version to the same manual semver had two costs:

1. The About-tab version read `1.2.0` for dozens of distinct web deploys — no way
   to tell which build a parent (or a bug report) was actually running.
2. The PWA "stuck client" recovery in `updates.ts` — fetch `/version.json`,
   redirect to `?v=<deployed>` on mismatch to force fresh HTML through a wedged
   service worker (ADR-0022) — only fired on a release bump, so it was dormant
   between releases. (The normal precache-hash SW update still ran every deploy;
   only the escape hatch was idle.)

We wanted a web version that moves every commit while keeping a deliberate,
human-meaningful prefix for real releases, and without disturbing native store
versions, which must stay exact and controlled.

## Decision

Branch the version derivation in `web/vite.config.ts` on the existing
`CAPACITOR` build flag (ADR-0001), the single web-vs-native signal:

- **Native** (`CAPACITOR=true`): use the `package.json` version verbatim. Store
  submissions need deliberate numbers; `capacitor-set-version` keeps Android/iOS
  in sync from the same source.
- **Web**: `major.minor.<commits-since-last-release-tag>`, e.g. `1.2.45`.
  `major.minor` comes from `package.json` (so a "big release" is a manual minor/
  major bump); the patch is `git describe --tags --long --match "v*"`, whose
  `…-<n>-g<sha>` suffix is the commit count since the last `v*` tag.
  `release.mjs` already creates and pushes that tag, so the patch resets to `0`
  at each release and climbs by one per commit after.

`__APP_VERSION__` and the emitted `version.json` both flow from this value
unchanged, so the About tab and the `updates.ts` mismatch check pick it up with
no other code changes. The mismatch redirect is safe to fire per-deploy: it runs
only once at init (page load, canvas empty), never on the focus/visibility/
interval paths, so it cannot interrupt a mid-drawing session.

**This relies on git history + tags at build time.** Netlify's deploy is **not**
a shallow clone — it is a *blobless* clone (`git clone --filter=blob:none`),
which carries the full commit graph and defers only file blobs, so `git
rev-parse`/`git rev-list` work. But the blobless clone does **not** fetch tags
(verified: an early deploy rendered `1.2.0+c5707ce`, the SHA fallback, because
`git describe` found no tag). The root `netlify.toml` build command therefore
runs `git fetch --tags --force || true` before `npm run build` so the release tag
is present and `git describe` resolves the commit count.

Tiered fallback, so the marker degrades informatively rather than silently:

1. tag reachable → `major.minor.<count>` (the normal path);
2. no reachable tag (genuinely shallow checkout / tagless tree) →
   `major.minor.0+<shortSha>` via `git rev-parse --short HEAD` (HEAD's commit
   object is present even in a shallow clone) — still unique per commit, still
   moves `/version.json`;
3. no git at all → the bare `package.json` version, so the build never breaks.

## Consequences

- + Every web deploy has a distinct, ordered, human-readable version; bug reports
  and the About tab pin the exact build.
- + The `updates.ts` stuck-client recovery is live on every deploy, not just at
  releases.
- + Native store versions are untouched — same `package.json` value, same
  `capacitor-set-version` flow.
- − The web **patch** digit in `package.json` is now web-irrelevant (overwritten
  by the commit count); releases should move **major/minor**. Recorded in the
  `release.mjs` header.
- − Introduces a build-time git dependency: the Netlify build command must
  `git fetch --tags` (the blobless clone omits tags). Mitigated by the SHA
  fallback (`major.minor.0+<sha>`) and the no-git last resort, so a fetch failure
  degrades gracefully instead of breaking the build.
- − `git describe`'s reset point is the most recent `v*` tag, so it assumes
  releases are tagged through `release.mjs` (they are). A manual `package.json`
  minor bump without a matching tag would not reset the patch until the tag
  lands.

See also ADR-0010 (compile-time build constants), ADR-0022 (PWA update
lifecycle), ADR-0001 (one codebase, two targets), ADR-0024 (Netlify build).
