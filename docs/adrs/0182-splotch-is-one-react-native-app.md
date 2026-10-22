# ADR-0182: Splotch Is One React Native App

**Status:** Accepted — supersedes [ADR-0001](0001-sveltekit-dual-adapter-strategy.md) and
[ADR-0024](0024-web-app-subdirectory-for-netlify-watcher.md); amends
[ADR-0020](0020-ios-build-toolchain.md) **Date:** 2026-10. The owner accepted these rulings on
2026-10-21 at the preflight of the cutover campaign (epic #3148). The cutover sub-issues #3151–#3164
implement this decision; #3164 reconciles the record with the RN-only tree. The migration branch
remains separate from `main` until the owner merges it.

## Context

Splotch shipped as one SvelteKit codebase with two targets (ADR-0001). Netlify served an SSR web app
with `/api/*` functions, and Capacitor wrapped a static export for Android and iOS. `CAPACITOR=true`
at build time chose between them.

The React Native migration (epic #2690) built the replacement in `experiments/native-architecture/`:
an Expo / React Native / React Strict DOM app that ships Android, iOS and a web export from one
codebase. At step 7 of that migration (#3007), before the deletion campaign:

* Netlify builds and publishes the React Native web export, and `netlify/functions/api.ts` serves
  every `/api` path (#3130). SvelteKit's code is still in the tree, but the deploy no longer uses
  it.
* The Capacitor shell, most of the test and perf infrastructure, and the release path still build
  from SvelteKit. The inventory on #3007 counted about 130 Capacitor and fastlane files, 147 E2E
  files, 263 perf files, 40 tooling files, the API smoke host, and about 960 files under `web/`.

The owner's direction, verbatim (2026-10-21, on #3007):

> "in 3007, I want the simplest forward looking architecture. So if we went RN from the start, where
> would we land. If capacitor and SveltKit aren't on that list, let's rip em out. If they're really
> the best in class things for the use cases they're still serving, sure, fine, but I'm suspect of
> that and it'd take some proving."

> "Sounds like we need another campaign just to delete all the old stuff. That should be part of the
> cutover and done before merging in codex/native-migration into main"

Epic #3148 turned that direction into rules:

* **Deletion by default.** A SvelteKit- or Capacitor-era piece stays only if written evidence shows
  it is the best tool for a use case the React Native app still has. "It still works" isn't enough.
* **Tools aren't frameworks.** Vitest, Playwright, Lighthouse, Netlify Functions and fastlane are
  each judged on their own merits. A tool that serves the React Native app is repointed at it, not
  deleted.
* **No lost coverage without a decision.** A test, perf or page-load gate is repointed or dropped
  with a recorded reason. The `/` startup caps and the per-page budgets stay enforced throughout.
* **No backward compatibility or data migration.**

The owner approved the rulings below at the campaign preflight, verbatim (2026-10-21):

> "Approved: merge reviewed, green PRs into codex/native-migration (never main); Codex may review
> the diffs; close sub-issues by hand after merge. Stop when done or Fri 10-23 13:00Z, usage 92%/95%
> weekly. Accept recommendations 2–6. Go."

The recommendations it accepted are the home, release, identity, E2E and tool rulings in the
Decision.

## Decision

### The end state

Splotch is one Expo / React Native / React Strict DOM app. It ships Android, iOS and a static,
prerendered web export from one codebase.

* Native ink renders through Skia (ADR-0178).
* Web and native code split by file extension (`.web.ts`, `.native.ts`), which Metro resolves at
  build time (ADR-0179). This replaces `CAPACITOR=true` as the one build-time platform signal.
* The web export paints a prerendered first frame and then hydrates it (ADR-0180). The native apps
  ship the bundled Farm book as asset files (ADR-0181).
* Netlify serves the export. One Netlify Function, `netlify/functions/api.ts`, serves every `/api`
  path. The background generation workers and scheduled purges beside it (ADR-0115) are unchanged.

### Home: the repo root

The app lives at the repo root: one `package.json`, with `src/`, `android/` and `ios/` beside it.
The move (#3163) followed deletion of the Capacitor projects (#3162) and SvelteKit app (#3161).
There is no `web/` or `experiments/` tree.

Alternatives considered:

* **`apps/splotch/`.** Cheaper, because it keeps the app at today's depth, so the move from
  `experiments/native-architecture/` is a string rename. But it keeps a monorepo shape for one app.
* **`app/`.** A single-level subdirectory with the same drawback.

The root wins because, once SvelteKit and Capacitor are gone, a subdirectory separates the app from
nothing. A project begun on React Native keeps its `package.json`, `android/` and `ios/` at its
root. The one reason the app was in a subdirectory, ADR-0024's watcher crash, goes away (see
`dev:netlify` below).

### Release: plain native scripts

Releases use Gradle `bundleRelease` and an `xcodebuild` archive plus `-exportArchive`, run against
the React Native projects, with manual store upload as today (#3158). The `build`, `cut-release` and
`publish-artifacts` skills use those scripts.

Today there is no fastlane setup. `fastlane/` holds only store-listing text (`fastlane/metadata/`),
store upload is manual, and CI never holds the shipping signing credentials. The Android deploy
smoke signs its Release APK with a throwaway key generated on the runner (ADR-0124). ADR-0020
rejected fastlane as "a Ruby dependency for what is currently two `xcodebuild` invocations".

Alternatives considered:

* **EAS.** It is Expo's default, and it supports bare projects. EAS Build would add an Expo account
  and cloud builds, and the shipping signing credentials would move into Expo's credential store. It
  would also need the monorepo uploaded as an archive, and it would fight the custom signing config.
  Automating upload through EAS Submit would add new credentials: a Play service account and an App
  Store Connect API key.
* **fastlane.** Ruby is already present for CocoaPods (the React Native app's `Gemfile` pins it), so
  ADR-0020's "no Ruby" reason is weaker now. But upload automation through fastlane would still need
  the same two new credentials.

Neither solves a problem the solo, manual-upload flow has. Either can be added later for upload
automation.

### Identity

The React Native app takes the shipping identity: `art.splotch.app`, the shipping Android upload
key, the shipping Apple team and the shipping version lineage (1.6.0, build 8). The next store build
therefore upgrades the shipping app in place.

Every non-store build carries `art.splotch.app.dev`, so nothing a developer installs replaces the
store copy. The root native projects default to `.dev`; explicit store scripts select the shipping
ID.

### Tools that stay, aimed at the React Native app

The three tiers of ADR-0008 (Vitest, Playwright, Maestro) survive, each repointed. Every tool below
stays for a use case the React Native app has, with the evidence that it fits that case.

* **Vitest, for unit and mounted tests.**
  * Use: unit tests for the app, the function and the tools. It also runs mounted tests of React
    Strict DOM components, which render through RSD's native build in happy-dom (ADR-0009,
    `tools/migration/rsd-drawing-vitest.config.mjs`).
  * Evidence: it is already the React Native app's test runner. It runs the native and RSD contracts
    under `tools/tests/` and `tools/migration/tests/`, the wire tests and retained shared tests in
    `src/lib/`.
  * Alternative: Jest with `jest-expo`, Expo's documented default. Moving to it would re-host every
    one of those files and gain no coverage.
* **Playwright, for browser E2E on the web export.**
  * Use: end-to-end tests of the web export in real browsers.
  * Evidence: it is the only runner in the repo that drives Chromium, Firefox and WebKit. The export
    already uses the Playwright library for three `postnative:web:build` checks: pages without
    JavaScript, the admin console against the real function, and the safe-area matrix.
  * #3153–#3156 ported the E2E suite into `e2e/`, with recorded reasons for deleted cases and
    explicit owner gaps in the disposition tables.
* **Lighthouse and the byte budgets, for page load.**
  * Use: the throttled page-load gate. `tools/page-load/run-lighthouse-ci.mjs` gates FCP and LCP
    against `tools/page-load/baseline.json` (ADR-0149).
  * Evidence: Lighthouse measured each of ADR-0179's and ADR-0180's startup cuts on the React Native
    export. The CI gate builds and times that export (#3157).
  * The byte budgets in `tools/migration/check-native-web-startup.mjs` are
    `MAX_NATIVE_WEB_FIRST_PAINT_BYTES` (47,052 at this decision),
    `MAX_NATIVE_WEB_CORE_CONTROLS_BYTES` (827,535) and `MAX_NATIVE_WEB_PAGE_BYTES` per page. They
    already run on the React Native export inside `build:site`, so on every Netlify deploy and in
    CI. They stay enforced throughout the cutover.
* **Maestro, for the native smoke.**
  * Use: the boot check on Android and iOS (ADR-0120).
  * Evidence: one YAML flow drives both platforms. `.maestro/smoke.yaml` serves the Android emulator
    and iOS simulator smokes today (ADR-0020), and the app carries no test code for it. Detox, the
    usual React Native alternative, is a gray-box runner that loads its own library into the app
    under test; a boot check needs no more than a black-box flow.
  * #3159 repointed the flows at the React Native apps.
* **Netlify with one Function, for hosting and `/api`.**
  * Use: serve the static export and every `/api` path.
  * Evidence: it already does both on this branch (#3130). The server is built on Netlify's own
    primitives: Blobs for storage (ADR-0025), background functions for generation (ADR-0115) and
    scheduled functions for the purges (ADR-0104). Another host would mean rebuilding each, for no
    use case the React Native app lacks. The wire-diff test
    (`tools/api-smoke/tests/wire-diff.test.mjs`) pins the function to the 108 responses recorded
    from SvelteKit and the 9 cases added since.
  * #3152 removed `@sveltejs/kit` from the function's server code; shared HTTP helpers are
    framework-free and wire-diff tested.

### Retired, each with its replacement

| Retired                                                                                                      | Replacement                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| SvelteKit, Svelte, `svelte-check`, the adapters, `vite-plugin-pwa`                                           | The React Native export, whose service worker `tools/migration/check-native-web-precache.mjs` checks |
| The Capacitor projects and plugins, `build:cap`, the `CAPACITOR=true` build signal                           | The React Native app's own native projects; platforms split by file extension (ADR-0179)             |
| The Capacitor CI and release jobs (`native-compile`, `android-deploy`, `ios-deploy`)                         | The React Native native jobs (#3159)                                                                 |
| The `release-build-smoke` job                                                                                | The `native-web-build` job                                                                           |
| `tools/check-bundle-budgets.mjs`                                                                             | `tools/migration/check-native-web-startup.mjs`                                                       |
| The `/dev/engine` perf targets, the advisory WebKit commit gates, the `tools/perf` web and Capacitor targets | The React Native in-app probe and replay traces (#3160)                                              |
| `dev:netlify`                                                                                                | Local `/api` on a plain Node host (#3152)                                                            |

The perf targets and commit gates drive engines that no longer ship. The worker sweep retired with
its Svelte suite. The flaky digest stays: RN shards emit `playwright-report-rn-shard-N` artifacts
through the retained reporter in `e2e/`.

### `dev:netlify` retires, and with it ADR-0024's reason for `web/`

ADR-0024 moved the SvelteKit app into `web/` because `dev:netlify` ran netlify-cli's file watcher
over the whole project root. That watcher opens one descriptor per directory, and it crashed on the
Capacitor native trees. Once local `/api` runs on a plain Node host (#3152), nothing runs that
watcher, so `dev:netlify` retires and the reason for a subdirectory goes with it. That is why
ADR-0024 is superseded and the app can live at the root next to its own native trees.

### E2E coverage, spec by spec

The campaign ported a SvelteKit spec when it tested behaviour the React Native app has and nothing
else covered it. Other specs were deleted with recorded reasons. The group A/B/C disposition tables
under `docs/scratchpad/2026-10-21-rn-e2e-dispositions/` preserve those decisions and the fourteen RN
gaps parked for the owner. Those gaps are not silently claimed as covered.

### Shared code

Framework-free app modules live under `src/lib/`, server modules under `netlify/server/`, and
tool-only modules under their capability in `tools/`. The root package and pnpm lockfile own one
dependency tree. Svelte components, rune stores and the Svelte drawing runtime were deleted.

### Supersessions

* **ADR-0001 is superseded.** One React Native codebase replaces one SvelteKit codebase with two
  adapters.
* **ADR-0024 is superseded**, for the reason above.
* **ADR-0020 is amended.** Its scripted `xcodebuild` archive and export, with automatic signing,
  apply to the React Native app's `ios/` project. That project resolves its native modules through
  CocoaPods (Expo autolinking in its `Podfile`), so ADR-0020's Swift Package Manager choice
  describes only the retiring Capacitor project. Its rejection of fastlane stands.

## Consequences

* \+ One app, one `package.json`, one dependency tree and one set of native projects. The platform
  split is a file extension, not a build flag.
* \+ Each tool that stays has a named use case in the React Native app, and the page-load budgets
  stay enforced through the whole cutover.
* \+ The release path adds no account, cloud service or credential. The signing material is the
  shipping app's.
* \+ The next store build upgrades the shipping install in place: the same ID, upload key, team and
  version lineage.
* − The React Native app reads none of the Capacitor app's storage, so what the shipping app stored
  on a device is not carried over, by the owner's direction. Pictures already saved to the photo
  library (ADR-0037) are outside the app and stay.
* − Once the Capacitor projects are deleted (#3162), `codex/native-migration` can no longer build or
  release a Capacitor app. Until the branch merges, only `main` can; after it merges, a Capacitor
  release means reverting the merge.
* − Store upload stays manual, by one person signed in to both stores. Automating it later, through
  EAS Submit or fastlane, means creating the Play service account and App Store Connect API key this
  decision avoids.
* − A `.dev` build is a separate app on the device, with its own storage, beside the store copy.
* − Each SvelteKit E2E spec costs a recorded decision, and a spec deleted as "covered by X" is only
  as good as X.
* − Historical Svelte/Capacitor ADRs preserve their original evidence. Retired decisions are
  superseded; surviving product/operational decisions carry an RN scope amendment and current
  owners. Their old paths and measurements are not instructions for the RN app.
