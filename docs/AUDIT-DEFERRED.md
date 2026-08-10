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
