# Browser-support floor duplicated across `vite.config.ts` and root `browserslist`

**Original finding:** [P1][duplication] — `web/vite.config.ts` (build target) vs `package.json`
(`browserslist`) vs `ios/App/App.xcodeproj` (`IPHONEOS_DEPLOYMENT_TARGET`) — deferred because the
implementer ran out of fix rounds with two objections unresolved: the native-safety test compared
the inequality in the wrong direction, and `.ruler/skills/mobile/ios.md` states the opposite
invariant. **Verdict:** FIX

## Context

The supported-browser floor is hand-maintained in two places that must stay identical:

* `web/vite.config.ts`
  `build.target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4']`
* root `package.json` `browserslist`:
  `"chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4"`

Only a prose comment keeps them in sync. Drift is not cosmetic: esbuild's `target` governs which
JS/CSS syntax is down-leveled, so bumping `browserslist` without the array (or vice versa) ships
syntax the declared floor can't run. A third coupled value — the Xcode `IPHONEOS_DEPLOYMENT_TARGET`
— is bound to the web floor only by comments, and nothing checks any of it.

The burndown draft derived `build.target` from `browserslist` via an inline mapper and added a unit
test, but review left two unresolved objections:

1. **The native-safety test enforced the inequality backwards** — an `ios_saf >= 17` floor passed
   against an iOS 16.4 deployment target, exactly the unsafe state. Reviewer demanded: compare each
   web Safari/iOS target as **less than or equal to** the native target, and correct the reversed
   `>=` invariant prose in `web/vite.config.ts` and `docs/COMPATIBILITY.md`.
2. **`.ruler/skills/mobile/ios.md:13` states the opposite invariant** ("It \[the native deployment
   target] MUST stay ≤ the web `build.target` iOS version"), directing future changes toward unsafe
   web targets; it must be fixed at the `.ruler` source and the generated `.claude`/`.agents` copies
   regenerated.

## The invariant, settled from first principles

This is the crux, so it is derived here rather than asserted:

* esbuild `build.target` is a promise about the **output**: the emitted JS/CSS uses only syntax the
  listed engine versions can parse. Raising the target lets *newer* syntax through.
* `IPHONEOS_DEPLOYMENT_TARGET` is a promise about **installation**: devices as old as that iOS
  version may install the app — and WKWebView's engine version is locked to the device's OS version.
* The native app serves the same bundle to every device that can install it, so the *oldest* engine
  that will ever execute the bundle inside the app is WebKit at exactly the deployment target's
  version.

Therefore the safety invariant is:

> **The web `build.target` iOS/Safari version MUST stay ≤ the native `IPHONEOS_DEPLOYMENT_TARGET`.**
> Equivalently: the native deployment target must stay ≥ the web floor. The web floor may be *older*
> than the native floor (merely conservative output — always safe), but never *newer*.

Violation example: web target `ios17` with deployment target `16.4` — an iPhone on iOS 16.4 installs
the app, its WebKit-16.4 WebView receives iOS-17-only syntax, and the app white-screens. Note that
this broken state *satisfies* the currently documented "web ≥ native" direction — proof the
documented direction is inverted.

The repo's own history confirms it: `docs/COMPATIBILITY.md` recounts that the deployment target was
raised from 15.0 to 16.4 precisely because "an iOS 15 WebView could be handed syntax/CSS it can't
run" under the 16.4 web floor. That broken state (web 16.4 ≥ native 15.0) satisfied the documented
invariant while violating the correct one.

The reviewer's objection 1 was therefore **correct and substantive**, not scope creep.

## Current state (verified at HEAD 63a7aa49)

The problem fully persists, and the inverted invariant is stated in **four** places:

1. `web/vite.config.ts:84-85` — comment: "the ios/safari versions here MUST stay **>=** the native
   iOS IPHONEOS_DEPLOYMENT_TARGET". Inverted.
2. `docs/COMPATIBILITY.md:41-42` — "The web target's iOS/Safari version MUST stay **≥** the native
   iOS deployment target". Inverted.
3. `docs/COMPATIBILITY.md:140-141` ("Maintaining this") — "Keep the web target **≥** the native iOS
   target". Inverted.
4. `.ruler/skills/mobile/ios.md:12-13` — "It \[native min OS] MUST stay **≤** the web `build.target`
   iOS version". Same inverted relationship, stated from the native side; propagated into generated
   `.claude/skills/mobile/ios.md` and `.agents/skills/mobile/ios.md`.

The duplicated lists are unchanged (both currently agree at 111/111/114/16.4/16.4; all four
`IPHONEOS_DEPLOYMENT_TARGET` entries are 16.4). No sync check exists.

Two things changed since the draft was written:

* `web/vite.config.ts` was restructured (`defineConfig(...)` wrapper, `define` now built by
  `buildDefines` from the new `web/defines.ts`). **The draft patch no longer applies at HEAD** — it
  is reference material only.
* `web/defines.ts` set a precedent this fix should follow: config logic extracted into a small
  sibling module in `web/`, tested from `web/src/` (vitest `include` is `src/**`).

## Options considered

**(a) Derive `build.target` from root `browserslist` with a small inline mapper (no new dependency),
plus an invariant unit test — the draft's approach, re-cut on HEAD. Chosen.**

* Pros: one source of truth — drift between the two lists becomes structurally impossible, not
  merely gated. Zero new dependencies. The repo's `browserslist` entries are deliberately pinned
  exact-version queries (`chrome >= 111`), so the mapping is a 10-line regex; anything the mapper
  doesn't recognize throws, failing the build loudly instead of silently mis-targeting.
* Cons: the mapper only supports the `"<browser> >= <version>"` query shape. Acceptable — the floor
  is intentionally explicit (the whole point of pinning `build.target` was to avoid moving targets),
  and the throw makes the limitation self-announcing.

**(b) Add `browserslist-to-esbuild` (+ `browserslist`) as dependencies. Rejected.**

* `vite.config.ts` executes during the Netlify build, and Netlify installs with `--omit=dev`
  (ADR-0070's inverted split), so both packages would have to join `dependencies` — two runtime deps
  (plus caniuse-lite data churn) to replace a 10-line mapper. `browserslist` is currently only a
  transitive dep of `vite-plugin-pwa`'s workbox chain — not something config code may import
  directly. The general-query power is exactly what this repo doesn't want: the floor is pinned on
  purpose.

**(c) Keep both hand-maintained lists, add a drift-check test only. Rejected.**

* The check needs the same parsing code as option (a)'s mapper, but buys less: drift becomes a CI
  failure instead of impossible. Same code, weaker guarantee.

Under every option the **native-safety invariant test is needed anyway** — nothing at HEAD checks
`browserslist`/`build.target` against the Xcode project.

## Decision

**FIX** — option (a), five parts:

1. **`web/browserTargets.ts`** (new, sibling of `web/defines.ts`): export
   `browserslistToEsbuildTargets(entries: string[]): string[]` mapping `"chrome >= 111"` →
   `"chrome111"` (`ios_saf` → `ios`), throwing on any entry not matching
   `^(chrome|edge|firefox|safari|ios_saf) >= <version>$`. Do **not** define it inside
   `vite.config.ts` (the draft did): importing `vite.config.ts` from a test executes module-level
   `sveltekit()`, `VitePWA()`, and `git` `execSync` calls — heavy and fragile.
2. **`web/vite.config.ts`**:
   `build: { target: browserslistToEsbuildTargets(ROOT_PACKAGE.browserslist) }` (the file already
   reads root `package.json` for `version`; widen that read). Rewrite the comment with the
   **corrected** invariant: "INVARIANT: the derived ios/safari versions MUST stay ≤ the native iOS
   IPHONEOS_DEPLOYMENT_TARGET (ios/App/App.xcodeproj), or an installable iOS device could be served
   syntax/CSS its WebView can't run."
3. **`web/src/browserFloor.test.ts`** (new, `@vitest-environment node`, precedent
   `web/src/app.html.test.ts`), three assertions:
   * mapper unit behavior on synthetic inputs, including the throw on an unsupported query;
   * the derived targets include exactly one `safari` and one `ios` entry (guards against deleting
     the `ios_saf` line and leaving a safari-only floor that no longer constrains WebView output);
   * **native safety, corrected direction**: for each derived `safari`/`ios` version and every
     `IPHONEOS_DEPLOYMENT_TARGET` parsed from `ios/App/App.xcodeproj/project.pbxproj`,
     `compareVersions(web, native) <= 0`, with a guard that at least one native entry was parsed.
4. **`docs/COMPATIBILITY.md`**: flip both inverted statements (lines ~41 and ~140) to "web target's
   iOS/Safari version MUST stay ≤ the native iOS deployment target"; mark `build.target` as *derived
   from* `browserslist` in the four-sources table and the "Maintaining this" list (the draft's doc
   hunk is a good template — its direction is already correct).
5. **`.ruler/skills/mobile/ios.md:13`**: replace "It MUST stay ≤ the web `build.target` iOS version
   in `web/vite.config.ts`" with "It MUST stay ≥ the web floor's iOS/Safari version (the web
   `build.target` is derived from the root `browserslist`) — lowering it below the web floor would
   let pre-floor WebViews install a bundle they can't run." Then `npm run ruler:apply` to regenerate
   the `.claude`/`.agents` copies — one source edit satisfies the whole objection.

Verification: flip one `browserslist` entry alone and confirm the build target follows it (no second
copy to drift); temporarily set `ios_saf >= 17` and confirm the new test **fails** (this exact probe
passed on the broken draft — it is the regression test for objection 1); `npm run
build`,
`npm run check`, `npm test` green; `npm run ruler:check` clean.

## Why the previous attempt failed, and how this path avoids it

* **Objection 1 (inequality backwards):** upheld as correct (derivation above). Resolved by stating
  the invariant as *web ≤ native* everywhere and asserting `compareVersions(web, native) <= 0`. The
  preserved draft's *final* state already compares this direction and its doc hunks already read "≤"
  — the direction fix appears to have landed in the draft's second commit but too late in the
  review-round budget. Carry it forward deliberately, with the `ios_saf >= 17` probe as proof.
* **Objection 2 (`ios.md` contradicts):** upheld — a skill stating "native must stay ≤ web" actively
  steers future edits into the unsafe state. Resolved by step 5; per repo convention the edit is
  made once in `.ruler/` and regenerated, so the objection's "update both generated copies" clause
  costs one command, not scope creep.
* **New failure mode to avoid:** the draft patch no longer applies at HEAD (`vite.config.ts` was
  restructured around `defineConfig`/`buildDefines`) and its test imported `vite.config.ts`
  directly. Re-implement on HEAD using the patch as reference; test the extracted module, not the
  config. (This also aligns with pending findings 9/10, which push in the same
  extract-from-`vite.config.ts` direction.)

One deliberate narrowing: the draft also asserted `viteConfig.build.target` deep-equals the mapper
output by importing the config. Skip it — once the literal array is gone, the only way to
reintroduce drift is to re-hardcode the target, which is a deliberate revert no test should chase; a
source-text regex assertion would be brittle for near-zero value.

## Implementation sketch

```ts
// web/browserTargets.ts
const QUERY = /^(chrome|edge|firefox|safari|ios_saf) >= (\d+(?:\.\d+)*)$/;

export function browserslistToEsbuildTargets(entries: string[]): string[] {
  return entries.map((entry) => {
    const match = entry.match(QUERY);
    if (!match) {
      throw new Error(
        `Unsupported browserslist entry "${entry}" — expected "<browser> >= <version>" `
          + `for chrome, edge, firefox, safari, or ios_saf (see docs/COMPATIBILITY.md).`,
      );
    }
    return `${match[1] === 'ios_saf' ? 'ios' : match[1]}${match[2]}`;
  });
}
```

```ts
// web/src/browserFloor.test.ts (core assertion — corrected direction)
for (const web of webkitFloorVersions) {
  for (const native of iphoneosDeploymentTargets) {
    // web floor must never be NEWER than the oldest installable WebView
    expect(compareVersions(web, native)).toBeLessThanOrEqual(0);
  }
}
```

## Post-merge addendum (2026-07-28, after PR 583 merged)

The Codex burndown merged in PR 583 resolved the **duplication half** of this finding the opposite
way: it deleted the root `package.json` `browserslist` (and the `update:browserslist` script)
entirely, making `web/vite.config.ts` `build.target` the single declaration, and rewrote
`docs/COMPATIBILITY.md` accordingly. With no second list, the derive-from-browserslist mechanism
above is moot — do not re-add a `browserslist` to implement it.

What **stands, unchanged and now more urgent**: the invariant-direction correction. The merged docs
state the backwards direction in more places than before — `web/vite.config.ts:80-82` ("MUST stay >=
the native iOS deployment target"), `docs/COMPATIBILITY.md:41-42` and `:140`, and
`.ruler/skills/mobile/ios.md:12-13` (equivalent form: native "MUST stay ≤ the web `build.target`").
The correct direction derived in this doc is unaffected by the single-declaration change: the web
target's iOS/Safari version must stay **≤** `IPHONEOS_DEPLOYMENT_TARGET`. The remaining fix is
therefore: flip the direction in those four places (the ios.md one via its `.ruler` source +
`npm run ruler:apply`) and add the native-safety invariant test from the sketch above, now reading
the floor from `vite.config.ts`'s literal (extract the target array to `web/browserTargets.ts` so
the test can import it without executing the Vite config, per the sketch's isolation rationale).
Nothing bites today because both values are 16.4 — the wrong prose direction is exactly what would
green-light the next unsafe bump.
