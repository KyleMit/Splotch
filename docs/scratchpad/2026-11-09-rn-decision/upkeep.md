# Upkeep lane: what each arm costs to keep current for a year

Refs #2690. Lane run 2026-11-09 21:53 → 2026-11-10 01:15 EST on the campaign Mac (Xcode 27.2). Both
trials ran in throwaway worktrees (`rn-decision-upgrade-trial` off `427756f14`,
`rn-decision-shipping-upgrade-trial` off `ef3d1eb20`), local branches only, never pushed. Raw logs,
timeline and screenshots are in the campaign scratch folder under `upkeep/`.

## Verdict

| Next 12 months    | RN (Expo/RN/Skia/RSD)                                                                                                   | Shipping (SvelteKit/Capacitor)                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent-days**    | **6–17** (desk estimate was 6–28)                                                                                       | **6–12**, front-loaded: two majors are pending today                                                                                         |
| **Owner time**    | 3–6 device sessions of 1–2 h: one per SDK step, which is where escaped regressions surface                              | 2–3 device sessions of 1–2 h (UIScene, Capacitor 9)                                                                                          |
| **Shape**         | Steady, frequent, mostly mechanical; tail risk is native I/O behaviour that CI cannot see                               | Lumpy: a few large framework migrations, each one multi-day                                                                                  |
| **Today's state** | Freeze's own Tools tier is **red** (GHSA exception expired 11-05); 9-patch catch-up trial took ~1 agent-hour, all green | Main's Quality is **red** (advisories); an SDK-27 iOS build **does not launch**; Kit 3 trial reached native builds but web PWA/offline broke |

The ranges overlap, so upkeep alone does not separate the arms. The trials narrow the desk review's
−2 on upgrade risk: RN's trial was smooth, while shipping's pending SvelteKit 3 migration proved
heavier than any RN patch train. **Nothing here flips the decision.** Read it as roughly −1 for RN
on upkeep: higher cadence and more owner device time, against shipping's known backlog.

## 1. Fresh upstream facts (npm registry and GitHub, read 2026-11-09 ~22:00 EST)

### RN arm, freeze `427756f14`

| Package                    | Freeze pin          | Newest published                                                                         | Expo 58.0.23 recommends |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| expo                       | 58.0.14 (10-16)     | 58.0.23 (11-03). No SDK 59 tag, canary or branch yet                                     | n/a                     |
| react-native               | 0.88.0              | 0.88.1 (10-27); 0.89.0-rc.1, `0.89-stable` branch exists                                 | 0.88.1                  |
| react / react-dom          | 19.3.0              | 19.3.1 (10-14)                                                                           | 19.3.0                  |
| @shopify/react-native-skia | 2.14.0              | 2.14.0                                                                                   | 2.14.0                  |
| react-native-reanimated    | 4.7.1               | 4.7.1                                                                                    | 4.7.1                   |
| react-native-worklets      | 0.13.0              | 0.13.1 (10-26)                                                                           | 0.13.0                  |
| react-strict-dom           | 0.0.54 (2025-10-02) | 0.0.55 (2026-01-09). Repo active (commits 11-07), typed-props work unreleased since June | n/a                     |
| react-native-svg           | 15.16.0             | 15.16.1 (11-05)                                                                          | 15.16.0                 |
| node-forge                 | 1.4.0 + local patch | 1.4.3 (11-04); 1.4.1 (10-27) is the fix                                                  | n/a                     |

Cadence, from npm publish times:

* **Expo SDK majors in 2026:** 55 (02-25), 56 (05-20), 57 (06-30), 58 (09-29): four in ten months.
  Gaps 84, 41 and 91 days. The desk review's 2–4 steps a year holds; 2026 sits at its top.
* **Expo patch train:** 58.0.0 → 58.0.23 in 35 days. The freeze is 9 patches behind after 24 days.
* **React Native minors in 2026:** 0.85 (04-07), 0.86 (06-09), 0.87 (08-11), 0.88 (10-15), about
  every two months. 0.89 is in RC, so SDK 59 is the next coordinated step (timing not announced).

### Shipping arm, main `ef3d1eb20`

| Package                            | Shipping lock | Newest published                     | Kind                      |
| ---------------------------------- | ------------- | ------------------------------------ | ------------------------- |
| @sveltejs/kit                      | 2.70.3        | 3.1.1 (3.0.0 on 10-01)               | major                     |
| @sveltejs/adapter-netlify          | 6.0.4         | 7.0.1                                | major                     |
| @sveltejs/adapter-static           | 3.0.10        | 4.0.0                                | major                     |
| svelte                             | 5.57.1        | 5.57.3                               | patch                     |
| vite                               | 8.3.1         | 8.3.7                                | patch                     |
| vite-plugin-pwa                    | 1.3.0         | 2.0.0 (10-03), no Dependabot PR open | major                     |
| @capacitor/core, cli, ios, android | 8.5.2         | 8.6.0 (10-28); 9.0.0-beta.0 (10-28)  | minor; next major in beta |
| @capacitor/assets                  | 3.0.5         | 4.0.0                                | major                     |

Capacitor majors land about yearly (7.0.0 2025-01-20, 8.0.0 2025-12-08, 9.0.0-beta.0 2026-10-28), so
a Capacitor 9 step is likely inside the next year.

### Dependabot on main (read-only `gh pr list`, 23 open, oldest 10-23)

* **Every one of the 23 fails Quality.** The cause is shared, not per-bump: the high-severity audit
  gate (`pnpm audit --audit-level=high`) is red on main itself (happy-dom, zod). Nothing merges
  cleanly until the advisories are cleared.
* **Svelte group** (Kit 3.1.0, adapter-netlify 7, adapter-static 4): 15 failing checks. Every Vite
  consumer stops at `config_file_unsupported`: Kit 3 no longer reads `svelte.config.js`.
* **vite 8.3.1 → 8.3.5 (a patch):** fails Release build smoke and Page-load because the startup page
  now preloads 37 chunks, not 38, and `check-bundle-budgets.mjs` pins the count exactly. A
  favourable change still needs a hand edit.
* **Capacitor group** (8.6.0, assets 4.0.0): fails only Quality and Browserless.

### Audit gate today (`pnpm audit --audit-level=high`, lockfile only)

| Tree                      | Result                                | High/critical advisories                                                          |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| RN freeze                 | fail: 9 high (+1 ignored, node-forge) | zod, happy-dom, node-forge (ignored)                                              |
| RN upgrade trial (pass 1) | fail: 3 high                          | zod, happy-dom                                                                    |
| Shipping main             | fail: 5 high, 2 critical              | handlebars (critical, via @capacitor/assets), vite, source-map-js, zod, happy-dom |

zod and happy-dom are shared tooling advisories on both arms. happy-dom has no fixed 20.x; both arms
need happy-dom 21. It matters more on RN: the prerender seam imports happy-dom in the production web
build, while shipping uses it only in tests.

## 2. iOS 27 SDK: shipping does not launch (tested)

Asked by the Codex method challenge, from the 2026-10-18 note on #2690 ("fresh shipping SDK27 stops
at lifecycle enforcement").

| Build                                                                               | Method                                                                                                                                                                                 | Result                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipping `ef3d1eb20`, pristine, Release, simulator, `art.splotch.app.baseline.main` | Xcode 27.2 (SDK iphonesimulator27.2), `build:cap` + `cap sync ios` + `xcodebuild`; fresh iPad Pro 13-inch sim on **iOS 27.0** runtime, `simctl launch`, process check at 12 s          | **Does not launch.** UIKit logs: "Application failed to launch: UIScene life cycle is required for apps built with this SDK." Process gone; home screen |
| Shipping + UIScene adoption                                                         | same, after the fix below (incremental rebuild 5 s)                                                                                                                                    | **Launches** on iOS 27.0 (alive at 12 s, drawing screen with palette, Clear and Settings) and on iOS **26.5** (alive at 12 s); no launch-failure line   |
| RN                                                                                  | `Info.plist` already names `EXExpoAppSceneDelegate`; PR 3000 recorded an iOS 27 simulator launch; the upgraded trial build (`art.splotch.app.dev`, SDK 27.2) was launched the same way | **Launches**: alive at 12 s, drawing screen. No migration needed                                                                                        |

* **Cause:** shipping's `ios/App/App/Info.plist` has no `UIApplicationSceneManifest` and its
  `AppDelegate` owns the window. Capacitor itself has shipped `CAPSceneDelegateProxy` since 8.5.x;
  the app project never adopted it.
* **Scope:** enforcement is keyed to the SDK the app links against. The setup lane's SDK 27.2 device
  build of the same source runs on the iPad because the iPad is on iPadOS 26.5. The store v1.6.0
  binary is unaffected until it is rebuilt. **The next shipping iOS release built with Xcode 27
  fails on every iOS 27 device**, so this is mandatory work before shipping's next iOS release, not
  a blocker for users today.
* **Fix tried:** a scene manifest (`$(PRODUCT_MODULE_NAME).SceneDelegate`, storyboard `Main`) plus a
  15-line `SceneDelegate` that forwards connect, open-URL and continue-activity to Capacitor's
  `SceneDelegateProxy`: +38 lines in 2 files, about 15 minutes to write. Device checks a real PR
  still needs: invite deep links (cold and warm), rotation lock, pause/resume, background
  coloring-pack downloads.
* **Capacitor 9** (beta 10-28; docs at `capacitorjs.com/docs/next/updating/9-0`) goes further: a
  SwiftUI `@main` entry point replaces the AppDelegate/storyboard, URL handling moves to
  `.onOpenURL`, plus Node 24, AGP 9.4.1 / Gradle 9.8.2, minSdk 26, compile/target SDK 37 and R8
  release builds.

## 3. RN upgrade trial (2026-11-09/10, worktree `rn-decision-upgrade-trial` off `427756f14`, not pushed)

No SDK 59 exists, so the trial took the newest SDK 58 patch train the documented way (Expo
`bundledNativeModules.json` alignment, `expo install --check`, `expo-doctor`, `pod update` for the
committed native project). It then took the shared audit fixes and RSD 0.0.55. Host: this Mac, Xcode
27.2. Every heavy step held the rig lock; times are wall-clock of the command itself.

**Pass 1: Expo 58.0.14 → 58.0.23, RN 0.88.0 → 0.88.1, 9 Expo modules, safe-area 5.11.1, node-forge
1.4.0+patch → 1.4.3 (patch retired)**

| Step                                                       | Result                                                                          |         Time | Break and fix                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | -----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit pins, rekey 3 patches, retire forge patch + exception | done                                                                            | ~5 min agent | none                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm install`                                             | pass, every remaining patch applied (installed-byte check, one node-forge copy) |         14 s | none                                                                                                                                                                                                                                                                                                                                                                                                     |
| `expo install --check`                                     | fail, then pass                                                                 |          1 s | Worklets 0.13.1 is not Expo-blessed (expects 0.13.0); reverted to 0.13.0                                                                                                                                                                                                                                                                                                                                 |
| `expo-doctor` (1.21.6)                                     | 20/20 pass                                                                      |          3 s | none                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run check`                                            | pass                                                                            |          8 s | none                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test:browserless`                                         | 4 Tools failures of 8,229                                                       |        123 s | **(a)** expired GHSA-86w9 record: fails on the untouched freeze too (review date 11-05 passed), fixed by retiring the record; **(b)** doc reference to the deleted patch; **(c)** Expo rewrote its web asset transformer between `@expo/metro-config` 58.0.14 and 58.0.21: emitted shapes unchanged, drift-guard source pin updated; **(d)** Podfile.lock not yet regenerated, see iOS row. ~6 min agent |

**Pass 2: shared audit fixes and RSD (happy-dom 20 → 21, zod lifted to 4.6.7, react-strict-dom
0.0.54 → 0.0.55 with the patch rebased)**

| Step                                                       | Result                                                                                                                                                                                                          |              Time | Break and fix                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rebase RSD patch                                           | 1 of 6 hunks failed on context only; rebased with fuzz, same 6 hunks                                                                                                                                            |      ~3 min agent | none                                                                                                                                                                                                                                                                                                                 |
| `pnpm install`                                             | pass, all patches applied                                                                                                                                                                                       |               9 s | none                                                                                                                                                                                                                                                                                                                 |
| `npm run check`                                            | 2 TS errors, then pass                                                                                                                                                                                          |        7 s / 13 s | RSD 0.0.55 narrowed `autoCapitalize`: `"off"` → `"none"` in `AdminConsole.tsx` (same HTML behaviour)                                                                                                                                                                                                                 |
| Tools tier                                                 | 9 failures, then 1, then 0                                                                                                                                                                                      |      123 s / 67 s | exact RSD version pin in `check-rsd-transform.cjs` (bumped; transform checks then pass on 0.0.55); Lighthouse 13.6.0 needs a re-captured `tools/page-load/baseline.json` (**reverted to 13.5.0**, so zod 3 via lighthouse stays a high advisory); rename not staged (trial artefact)                                 |
| `npm run build:site`                                       | **pass**: first paint 45,660/47,052 B, core controls 820,085/827,535 B, 151 precache entries, every page incl. admin                                                                                            |              23 s | none. **The private-API prerender seam survived**: `createMetroServerAndBundleRequestAsync` is unchanged across 8 CLI patches (offset only) and `@expo/router-server` `html.js` is byte-identical; happy-dom 21 works in it                                                                                          |
| `npm run native:web:build` (adds the Chromium post-checks) | **pass**: 6 pages read in full without JS in all 8 layouts and colour schemes; `/admin` signs in on the local `/api`, survives reload, lists/adds/removes codes; 67 safe-area scenarios over 20 device profiles |              48 s | none                                                                                                                                                                                                                                                                                                                 |
| `npm run android:apk` (Release, `.dev`)                    | **pass**, 147 MB, 4 ABIs                                                                                                                                                                                        |        6 min 31 s | none                                                                                                                                                                                                                                                                                                                 |
| `npm run ios:simulator:development`                        | fail, then **pass**                                                                                                                                                                                             | 12 s / 2 min 18 s | `pod install` refuses a changed local podspec version (`ExpoFont`); fix `pod update --no-repo-update` (46 s; PR 3000 hit the same). It also rewrote `PrivacyInfo.xcprivacy`: keys reordered and the compliance comment block deleted. The privacy guard passes (6/6), so a reviewer must restore the comment by hand |
| Podfile guard                                              | pass                                                                                                                                                                                                            |              <1 s | none                                                                                                                                                                                                                                                                                                                 |
| Launch on iOS 27.0 simulator                               | **alive at 12 s, drawing screen**                                                                                                                                                                               |              56 s | none                                                                                                                                                                                                                                                                                                                 |

**Not exercised:** the Playwright suite (1,172 cases, host-exclusive), physical devices and the
4-step post-SDK device checklist in `DEVELOPMENT.md`, a Lighthouse re-baseline, store signing. These
are where PR 3000's escaped regression would have been caught.

**Effort:** about **45–60 min of agent hands-on time** and about **17 min of machine time** for a
9-patch catch-up, plus about 3 h queued on the rig lock (campaign contention, not upkeep). Breaks:
**9 distinct**, all mechanical. One (the GHSA expiry) is a **time bomb already red on the frozen
candidate**. None needed product judgement except `autoCapitalize`.

**Patch ledger after the trial (7 → 6):**

| Patch                                             | State                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node-forge 1.4.0                                  | **retired**: upstream 1.4.1 (10-27) re-encodes DigestInfo canonically, stronger than the local check. GHSA still lists no patched version; issue 2696's source audit is satisfied by the diff, and its CSR/certificate behaviour re-audit is not done |
| expo-audio, expo-screen-orientation, react-native | rekeyed, apply unchanged (upstream still has each bug)                                                                                                                                                                                                |
| react-native-svg 15.16.0                          | unchanged: Expo still pins 15.16.0; also applies to 15.16.1                                                                                                                                                                                           |
| react-strict-dom                                  | rebased to 0.0.55, context-only drift                                                                                                                                                                                                                 |
| @stylexjs/stylex 0.15.4                           | unchanged: RSD 0.0.55 still requires `^0.15.4`. It fails against stylex 0.19.1, so it will need a recut when RSD moves stylex                                                                                                                         |

## 4. The one real SDK major step on record: PR 3000 (Expo 57 → 58, RN 0.86 → 0.88)

This repo has done exactly one Expo SDK major upgrade (the candidate started on SDK 57 in PR 2697).
Read from the PR and its follow-ups with `gh`:

| Item                          | Measured                                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elapsed, first commit → merge | 10:31 → 14:10 UTC on 2026-10-19: **3 h 40 min**, agent-driven, 8 commits, 55 files, +1,873 / −2,023                                                                                                                                                                        |
| Reviews                       | 2 rival rounds (round 1: 3 real findings, all fixed; round 2 clean)                                                                                                                                                                                                        |
| Breaks fixed in the PR        | RN 0.88 strict TS (refs on 24 files); Expo exports map (`tsconfig.base`); Worklets 0.13 closure layout; react-native-svg 15.16 web split; RN dropped `abort-controller` and assets-registry; AGP 8.12→9.2.1, Kotlin 2.2, compileSdk 37, Gradle 9.4.1; Podfile.lock rewrite |
| Patches                       | expo-audio and expo-screen-orientation **recut by hand**; RN and svg rekeyed; Reanimated and Skia patches **retired** (fixed upstream)                                                                                                                                     |
| Owner decision needed         | yes: React 19.3 `react-dom` pushed the web startup over its byte cap (+29 KB); owner raised the cap                                                                                                                                                                        |
| Same-day follow-up            | PR 3004 (10 min): chunking/tree-shaking won the cap back down                                                                                                                                                                                                              |
| Escaped regression            | **Issue 3062, found next day by the owner on the Galaxy:** SDK 58 made `File.write()` async, so settings failed to save. CI, both rival rounds and the device A/B all missed it. Fixed in PR 3064 (~1 h)                                                                   |
| Device time                   | orchestrator device A/B, 5 pairs; owner device session that found 3062                                                                                                                                                                                                     |

So one SDK step cost about **one agent-day of elapsed work plus one owner device session and one
owner decision**, and a behaviour change still reached the owner's hands. That is well under the
desk review's 3–7 engineer-days per step in elapsed time. But the escaped regression is the real
cost: CI does not exercise native I/O semantics. `DEVELOPMENT.md` now carries a 4-step manual
post-SDK checklist per platform for exactly this reason.

## 5. Shipping symmetry trial (worktree `rn-decision-shipping-upgrade-trial` off `ef3d1eb20`, not pushed)

The trial applied the pending Dependabot majors: Kit 3.1.1, adapter-netlify 7.0.1, adapter-static
4.0.0, Svelte 5.57.3, Vite 8.3.7, Capacitor 8.6.0 and assets 4.0.0, happy-dom 21.0.4, svelte-check
4.7.8. It added vite-plugin-pwa 2.0.0 and kept the UIScene fix from section 2. Time-boxed to 2 h;
stopped after ~1 h with enough evidence.

| Step                                                        | Result                                                                                                                                                                                                                                                                |       Time | Break and fix                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                                              | pass; pnpm wrote 17 `minimumReleaseAgeExclude` entries because vite 8.3.7 is under a day old                                                                                                                                                                          |       10 s | supply-chain policy friction                                                                                                                                                                                                                                                   |
| `sv migrate sveltekit-3` (sv 1.3.0), the documented codemod | **refused twice**: no `package.json` in `web/` (ADR-0024 layout), and at the root "`@sveltejs/kit` is not a devDependency" (ADR-0070 split)                                                                                                                           |        0 s | temporary `web/package.json` shim; the codemod then ran all 12 tasks: **423 files, +2,106/−2,153**, plus `web/MIGRATION_TASKS.md` with **9 manual task groups / 33 file reviews** and one `@migration-task`                                                                    |
| `npm run build`, round 1                                    | fail `module_removed_lib`                                                                                                                                                                                                                                             |        3 s | the codemod missed 2 `.svelte` imports, `app.css` `url('$lib/…')`, and the generator `tools/release/gen-release-notes.mjs`, which re-emits `$lib` on every build. Fixed by hand (~20 min diagnosis)                                                                            |
| vite-plugin-pwa 1.3 → 2.0                                   | same failure, then past it once the generator was fixed                                                                                                                                                                                                               |        7 s | none                                                                                                                                                                                                                                                                           |
| `npm run build`, round 2                                    | Vite build completes, **postbuild gates fail**: adapter-netlify 7 moved the server to `web/.netlify/v1/server` (check path patched); then **`sw.js` is not emitted**: PWA precache 9 entries / 0 KiB vs main's 275 / 6.1 MB, so **web offline is broken**. Unresolved |        5 s | open: likely needs `@vite-pwa/sveltekit` or re-wiring for Kit 3's per-environment builds (`transformIndexHtml` hooks also unsupported). Netlify staging (`tools/stage-netlify-functions.mjs`, `netlify.toml`) assumes the old adapter layout; needs a preview deploy to verify |
| `npm run build:cap`                                         | Vite + adapter-static pass; version and static-bundle gates pass; **startup budget fails: native `index.html` modulepreloads 31 chunks, up from 28**                                                                                                                  |        4 s | open (investigate the chunking or re-baseline)                                                                                                                                                                                                                                 |
| `cap sync` + iOS sim Release (`.baseline.main`)             | **pass**                                                                                                                                                                                                                                                              | 2 s + 21 s | none                                                                                                                                                                                                                                                                           |
| Launch on iOS 27.0 simulator                                | **alive at 12 s, drawing screen with paper texture**                                                                                                                                                                                                                  |       73 s | none                                                                                                                                                                                                                                                                           |
| Android `:app:assembleRelease`                              | **pass**                                                                                                                                                                                                                                                              |       29 s | none                                                                                                                                                                                                                                                                           |
| `npm run check`                                             | **11 type errors in 6 files**                                                                                                                                                                                                                                         |        6 s | Kit 3 `handleError` now carries `status` (4, a behaviour change to review, not only types); readonly `Platform` in the generate-image route (4); readonly CSP directive types (1); generator `#lib` import without the now-required extension (1). Unfixed: about 1–2 h        |

**Effort to here:** about 1 agent-hour hands-on and about 3 min of machine time. Both native apps
build and launch on the new majors. The web arm is not shippable: no service worker, a startup
regression, unverified Netlify deploy staging, 11 type errors, 33 manual reviews, and the Playwright
8-shard suite not run. **Estimate to finish SvelteKit 3: 3–6 agent-days.**

## 6. Annual range, item by item

| Item (next 12 months)   | RN                                                                                                                   | Shipping                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Framework majors        | 2–4 Expo SDK steps (2026 had 4) × 1–2.5 agent-days (PR 3000: ~1 day incl. fallout) = **2–10**                        | SvelteKit 3 now **3–6**; Capacitor 9 (beta; SwiftUI entry, Node 24, AGP 9.4.1, minSdk 26, R8) **1.5–4** |
| Patch trains            | monthly catch-ups like this trial (~1 h hands-on) plus E2E and device smoke ≈ 2–3 h each = **3–4.5**                 | folded into Dependabot triage (shared baseline, not counted)                                            |
| Local patches / pins    | 6 patches, recut inside SDK steps; RSD's unreleased typed-props API and the stylex recut **0.5–2**                   | none                                                                                                    |
| Platform mandates       | none found (already UIScene; no CocoaPods Trunk pods)                                                                | UIScene adoption **0.5** (fix measured at 15 min + device checks)                                       |
| Advisories / exceptions | node-forge retired (done); happy-dom 21 on the production build path; zod 3 needs a Lighthouse re-baseline **0.5–1** | handlebars (critical, via @capacitor/assets 4), vite, source-map-js, zod, happy-dom **0.5–1**           |
| **Total agent-days**    | **6–17**                                                                                                             | **6–12**                                                                                                |

Shared and not counted: Dependabot triage (23 open PRs in 18 days on main; every one red on the
shared audit gate). Also exact ratchet gates that turn favourable bumps red (vite 8.3.5's 37-vs-38
modulepreload). Both arms carry the same tooling tree.

## 7. Defects found

| Defect                                                                                                                                | Severity                                               | Arm      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| An iOS build linked against SDK 27 does not launch on iOS 27 (no UIScene lifecycle); fix tested, +38 lines                            | major (blocks the next iOS release, not today's users) | shipping |
| Frozen candidate's Tools tier fails today: the GHSA-86w9 audit exception expired 2026-11-05; retired in the trial by node-forge 1.4.3 | major (CI red until fixed)                             | RN       |
| High-severity audit gate red: happy-dom, zod (both); node-forge (RN, ignored); handlebars critical, vite, source-map-js (shipping)    | major                                                  | both     |
| SvelteKit 3 breaks the PWA service worker (no `sw.js`), so the web app loses offline                                                  | major (pending-upgrade cost)                           | shipping |
| SvelteKit 3 adds 3 startup modulepreload chunks to the native export                                                                  | minor                                                  | shipping |
| `pod update` rewrites `PrivacyInfo.xcprivacy`, deleting the compliance comment (keys only reordered; guard passes)                    | minor                                                  | RN       |
| Kit 3 codemod cannot run on the repo layout, and misses generator templates and CSS `url()`                                           | minor                                                  | shipping |
| SDK 58 `File.write()` async change escaped CI, rival review and device A/B (issue 3062, already fixed)                                | major, historical                                      | RN       |

## 8. Limits

* No SDK 59 exists yet, so the RN trial is a patch train, not a major step. The major-step cost
  comes from PR 3000 (one sample).
* Neither trial ran Playwright or physical-device checks. RN's documented escaped regression lives
  exactly there.
* Agent-days are elapsed agent work as this project actually operates (agent-led, owner reviews);
  they are not engineer-days and include no review-queue latency.
* Lock contention, not upkeep, dominated wall-clock: about 3 h of this lane was queued on the rig
  lock behind timing captures.
* Not repaired in the trial and left for a real PR: `docs/DEPENDENCIES.md`'s summary prose still
  names node-forge, and shipping's duplicate `isCapacitor2` from the codemod.
