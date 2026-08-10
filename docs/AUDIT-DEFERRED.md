# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of fixing
> — the verifier was unavailable, the implementation failed, or the change never passed adversarial
> review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an issue, or drop it.

The 2026-07-27 triage pass reviewed the 49 findings deferred up to that date and drained them from
this file: 30 FIX verdicts were re-staged in `docs/AUDIT.md` with resolution guidance, 9 OPTIONS
verdicts became `type:audit` + `needs-triage` GitHub issues (564-572), and 10 DROP verdicts were
retired with rationale. The disposition index (`docs/audit-deferred/triage/README.md`) and full
original texts remain in this file's git history — the triage directory was removed once every
verdict was dispatched.

The 2026-07-28 triage pass reviewed the 15 findings that arrived after that pass and drained them
too: 13 FIX and 2 DROP verdicts, each recorded as a standing decision doc in
`docs/audit-deferred/decisions/` (see its `README.md` for the verdict index and per-finding
rationale). Full original finding texts remain in this file's git history at commit 5b16292; the
rolled-back draft patches under `docs/audit-deferred/*.patch` are kept where a decision doc cites
them as reusable raw material.

Entries below arrived after those passes and are awaiting triage.

### [Performance] Pinch move path allocates per pointermove, against the repo's hot-path rule

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (`centroid` lines 54–62, `recompute` lines
89–108, `local` lines 169–172) @ cd04c367; `web/src/lib/actions/spreadTracker.ts` (`points()` lines
20–22)

**Priority:** P4

#### Problem

The svelte rule file is explicit that gesture trackers are hot paths: "code reached per pointermove
… must not allocate arrays/objects". Each `pinchZoom` move allocates: `tracker.points()` builds a
fresh array (twice per move — `recompute` line 91 and inside `centroid`'s caller), `centroid`
returns a new object, `local` returns a new `Point`, `recompute` builds a new transform object, and
`apply` builds a template string. A prior commit (f3faf52) already removed one such allocation from
`spread()`, so the codebase treats this path as worth tightening; the remaining ones are the same
class. In fairness this runs only while pinching the AI preview (not while drawing), so the
practical stakes are modest — but the stated rule draws no such distinction, and the fix is cheap.

Secondary: the `rect ?? node.getBoundingClientRect()` fallbacks (lines 165, 171) are defensive
lazy-init on the move path — unreachable in practice (`rect` is always set by the `pointerdown` that
made `pointerCount > 0`), which the hot-path rule also calls out.

#### Proposed solution

Give the tracker a non-allocating iteration surface (e.g. `forEach(cb)` or reused first/second
accessors — it already has an allocation-free `spread()`); compute the centroid with a running sum
over that; reuse a scratch `Point`/transform object in `recompute`. Replace the `??` fallbacks with
a direct `rect!`-free structure: snapshot `rect` in `onPointerDown` and pass width/height/left/top
through the closure invariant (a comment stating the invariant beats a silent re-measure). Verify
with `npm run perf:*` only if the drawing path is ever routed through this tracker; otherwise a
before/after allocation check in DevTools is enough.

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `pinchZoom` still allocates on every engaged `pointermove`: the production `getOptions()` callback
  in `AiImageResult.svelte` creates a fresh options object, and `apply()` creates a new transform
  template string. Cache the reactive option fields outside the move handler and eliminate the
  per-move transform-string construction so the original hot-path finding is actually resolved.
* `web/src/lib/actions/pinchZoom.svelte.ts:172` still allocates on every engaged pointer move:
  `CSSStyleDeclaration.setProperty` requires a string, so passing each number through a double cast
  merely hides three numeric-to-string conversions. Use a genuinely allocation-free update mechanism
  instead.
* `web/tests/ai-timer.spec.ts` only checks that the constant inline transform contains `scale(`, so
  it passes even if the new custom-property values are never applied and the image does not visually
  zoom. Assert the computed transform or changed rendered geometry.
* `pinchZoom`’s `destroy()` never cancels the three paused, `fill: 'both'` animations, so tearing
  down the action after any pointerdown can retain animations and the detached target; cancel them
  during destruction.
* The updated `ai-timer.spec.ts` only compares element widths, so both translation animations—and
  therefore centroid anchoring and one-finger panning—can be broken while the test stays green;
  assert the layer’s rendered position after an off-center pinch and zoomed one-finger pan.
* The new dependency on `Element.animate()`, `Animation.currentTime`, and additive transform
  composition is absent from `docs/COMPATIBILITY.md`, despite that document requiring every newly
  introduced browser API to be checked against the supported floor and registered.

#### What was tried

1. Updated pinch tracking to reuse point, centroid, transform, bounds, and rebase state in place,
   eliminating move-path snapshots and fallback layout reads. The AI preview now uses the rect
   captured at the accepted first pointer-down for all gesture coordinates.
2. Cached the reactive target and enabled fields outside pointer moves. The zoom transform is now
   installed once and updated through numeric CSS custom properties, avoiding per-move option
   objects and transform-template construction.
3. Replaced per-move CSS value serialization with paused additive transform animations driven only
   by numeric animation times. Updated the AI preview E2E coverage to verify its rendered width
   grows during pinch and returns to fit afterward.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/performance-pinch-move-path-allocates-per-pointermove-against-the-repo-s.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/performance-pinch-move-path-allocates-per-pointermove-against-the-repo-s.patch`.

### [Maintainability] The supported Node floor (engines 22.13) is never exercised — CI hardcodes Node 24 with no tie to `engines`

**File(s):** `.github/actions/setup-node/action.yml` (line 19); `package.json` (lines 5–7);
`docs/CONTRIBUTING.md` (line 14) @ cd04c367

**Priority:** P3

#### Problem

The Node version is stated independently in at least four places with three different values:

* `package.json` engines: `"node": ">=22.13"` (line 6)
* `.github/actions/setup-node/action.yml`: `node-version: 24` (line 19) — every CI job (quality,
  tests, both deploy smokes, blobs smoke) runs on 24
* `docs/CONTRIBUTING.md` line 14: "**Node 22** via nvm" (22.0 does not satisfy engines). This was
  `README.md` line 39, "Node.js 22+ and npm", at 9ae62ff1; the README's prerequisites moved into the
  contributing guide before f5bf8767 and the version claim moved with them.
* `.codex/cloud/setup.sh`: 22.12 (previous finding)

Meanwhile the production Netlify build pins no `NODE_VERSION` in `netlify.toml`, so it runs
Netlify's platform default (a 22.x LTS). Net effect: **CI validates the whole suite on Node 24, but
the deploy — and the declared minimum — run on 22.x, which CI never touches.** A dependency or
script using an API that exists in 24 but not in 22.13 (the `--experimental-strip-types` behavior
itself differs across these majors) goes green in CI and breaks only at deploy or on a floor-version
dev machine. There is no comment in `action.yml` explaining why 24 was chosen over the floor, and no
drift guard connecting any of these sites — the repo's own convention says cross-file agreement is
kept by an imported constant or a drift-guard test, never prose.

#### Proposed solution

Pick one deliberate policy and encode it:

* Cheapest: point CI at the floor via `node-version-file: package.json` (setup-node resolves
  `engines.node`), so CI always tests the version the repo promises to support, and bumping the
  floor is a one-line `engines` edit. If testing the latest major is also wanted, that's a matrix
  decision worth a comment.
* If staying on a hardcoded 24 (e.g. "test what developers actually run"), add the WHY comment in
  `action.yml` and a drift-guard case in `scripts/tests/workflow-hygiene.test.mjs` asserting
  `node-version` ≥ the `engines` floor, so a future engines bump can't silently overtake CI.

Fix `docs/CONTRIBUTING.md`'s "Node 22" to match `engines` (or reword to "the version in package.json
`engines`" so it can't drift again).

#### Why it was deferred

implementation failed

#### What was tried

The runner exposes `.codex/**` as read-only, so I could not update `.codex/cloud/setup.sh` from
22.12+ to 22.13+. The remaining scoped changes are present, but returning a partial fix as
successful would narrow the brief.

### [Testing] Android minSdk floor ↔ COMPATIBILITY.md agreement is maintained by prose

**File(s):** `android/variables.gradle` (line 2) · `docs/COMPATIBILITY.md` (lines 18, 35–37, 95–99)
· `scripts/tests/android-config.test.mjs` (lines 14–29) @ cd04c367

**Priority:** P4

#### Problem

`docs/COMPATIBILITY.md` names `android/variables.gradle → minSdkVersion` as the authoritative source
of the "Android 7.0 / API 24+" support floor (its lines 18, 35–37, 95–99). The iOS side of the same
table got a real drift guard — `web/src/browserFloor.test.ts` parses `IPHONEOS_DEPLOYMENT_TARGET`
out of the pbxproj and compares it against `BROWSER_TARGETS`. The new
`compatibility-register.test.mjs` validates the separate API risk register's path/marker anchors,
not the platform-floor values. The Android side has no numeric agreement guard:
`scripts/tests/android-config.test.mjs` deliberately scopes its patterns to the *emulator* API level
("the API 24 minSdk floor … don't false-positive", lines 22–24), so nothing fails if
`minSdkVersion = 24` (`variables.gradle:2`) is raised while COMPATIBILITY.md, the store listing
floor, and the Maestro floor-run issues (\#483) still say 24. Per the cross-file-agreement
convention this is exactly the drift-guard-test case.

#### Proposed solution

Add a `describe('Android support floor single source')` block to `android-config.test.mjs`: parse
`minSdkVersion = (\d+)` from `android/variables.gradle`, and assert the contextual "API 24"/"Android
7.0 / API 24+" phrases in `docs/COMPATIBILITY.md` (and `.ruler/skills/mobile/android.md` if it
states the floor) match. Use the same allowlist + context-anchored-pattern approach the file already
established for the emulator level, so historical docs stay exempt.

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* The guard omits the authoritative-table claim at `docs/COMPATIBILITY.md:99`, so changing
  `minSdkVersion` and the two matched prose claims while leaving `Native Android min SDK | … | 24`
  stale still passes. Add a context-anchored assertion for that value.
* The drift guards validate only the API integer while hard-coding the human Android release as
  regex context, so raising `minSdkVersion` to 25 and changing the captured claims to API 25 would
  still allow stale “Android 7.0” labels in `docs/COMPATIBILITY.md`,
  `.ruler/skills/mobile/android.md`, and `MIN_ANDROID_RELEASE` in
  `web/src/lib/components/androidBeta/androidBeta.ts`; guard the API-to-release agreement too.
* The support-floor allowlist in `scripts/tests/android-config.test.mjs` omits the current
  floor-validation statement in `docs/COMPATIBILITY.md` (“API 24 emulator” / “Android 7”), so
  updating the matched claims after a floor raise can leave that paragraph and its linked #483
  floor-run stale while the guard passes. Add a context-anchored check for this floor-run claim.

#### What was tried

1. Added an Android support-floor drift guard that derives `minSdkVersion` from Gradle and verifies
   the anchored compatibility and mobile-skill claims. This keeps public Android support statements
   aligned while leaving emulator API validation independent.
2. Added the missing context-anchored assertion for the Native Android min-SDK compatibility table
   value, so that published claim now tracks Gradle along with the other support-floor contexts.
3. The support-floor guard now maps Gradle’s API level to its Android release and verifies both
   values across the compatibility claims, mobile skill, and in-app beta constants.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/testing-android-minsdk-floor-compatibility-md-agreement-is-maintained-by.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/testing-android-minsdk-floor-compatibility-md-agreement-is-maintained-by.patch`.

### [Testing] Run the self-contained API-contract smoke (`test:api:smoke`) in CI

**File(s):** `.github/workflows/test.yml` (`unit` job, lines 125–142; `test` job, lines 149–190);
`package.json` (line 88, scripts-info line 247) @ cd04c367

**Priority:** P2

#### Problem

The repo has a purpose-built, dependency-free gate for the `/api/*` contract:

```json
"test:api:smoke": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/api-smoke.mjs",
```

whose own scripts-info description (package.json line 247) says it is "self-contained: boots a
throwaway vite dev with test env, exercises the CORS/preflight contract + the admin auth flow + a
public oracle against the documented /api/* shapes, tears down (no Gemini/Blobs needed)". Nothing in
`.github/workflows/test.yml` runs it — the `unit` job runs `test:unit`, `test:asset-gen`, and
`test:scripts` (lines 125–142), while the sharded `test` job runs `test:e2e` and `test:driver:smoke`
(lines 149–179); no other workflow references `api:smoke`/`api-smoke` (grep of `.github/` returns
nothing). The driver smoke was added to CI at lines 173–179 precisely because "the gen:* generators
… never run elsewhere in CI, so this smoke keeps that module from rotting silently" — the identical
rationale applies to the API smoke, which `.claude/rules/server-api.md` (lines 45–47) relies on
developers remembering to run by hand after endpoint changes. A CORS/auth/shape regression on
`/api/*` currently ships with green CI and is only caught post-deploy by `blobs-smoke.yml` (which
tests one narrow thing: Blobs persistence).

#### Proposed solution

Add a step to the `test` job after the E2E run (it needs no browsers, so placement is flexible):

```yaml
# The /api/* contract (CORS, admin auth, oracle shapes) has no other CI
# coverage; self-contained — boots its own throwaway dev server.
- name: API contract smoke
  run: npm run test:api:smoke
```

Also consider folding it into `npm test` (package.json line 46) so the local composite matches; if
that is done, update the `test` scripts-info entry and CLAUDE.md's command table in `.ruler/` in the
same change. Gotcha: verify the throwaway vite dev server's port doesn't collide with the Playwright
`vite preview` server if steps ever run concurrently (they don't today — steps are sequential).

#### Why it was deferred

verifier unavailable
