# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

That last line is the one this file kept failing. The 2026-07-28 comprehensive per-section audit
filed 649 raw findings here and they were worked as a standing backlog for ten days. Successive
burndown campaigns fixed roughly 300, and two `/vet-audits` passes drained the severity head into
issues #774–#785. On 2026-08-07 the remaining 346 were re-triaged against `main` and cut to 75; the
other 271 were deleted outright. The deletion was the point rather than a side effect — the
reasoning is in `docs/AUDIT-LOG.md` under 2026-08-07 · audit-triage, and every deleted finding
remains in this file's git history. The re-pinning below dropped 3 more, leaving 72 here.

The 2026-08-07 `burn-down-audits` campaign (PR #830) then fixed 29 of those with no drops and no
deferrals, which emptied the *Silent wrong output* group outright — its section is gone from the
list below, and `docs/AUDIT-LOG.md` carries the run's row. The compatibility-register drift guard
then removed one more resolved finding. This review dropped two more findings whose reports had
drifted out of date, leaving the 40 below.

**Citations are pinned to commit cd04c367 (2026-08-07), the current `main` head at the time of this
review.** They were originally taken at 9ae62ff1 (2026-07-28), then re-pinned to f5bf8767
(2026-08-06). Every cited line was re-derived against cd04c367 by following the referenced symbol or
content, not by preserving its old offset.

The 3 findings dropped during the re-pinning were the ones whose citations still resolved but whose
code no longer said what the finding described, because each had been fixed in the meantime:
create-adr's step 4 now reads "do not count files"; `MAX_HOT_RASTERS` no longer exists in the perf
harness; and `scripts/tests/dev-ports.test.mjs` now guards the dev/preview ports. Follow any
citation below directly; re-verify the surrounding code anyway.

The `##` sections below are **curated groups**, not the usual per-producer `## Source: <audit>`
sections — each names the criterion that earned its findings a place, because that criterion is the
argument for keeping them. A new producer still appends its own `## Source:` section as normal; the
two shapes coexist and the merge rules are unchanged. Priorities (P2–P5) are the original
within-section ranks and are not comparable across groups; the grouping supersedes them.

## App correctness that reaches users

Behaviour defects in shipped `web/src/` and native-shell code. These are the ones that would
eventually arrive as a bug report — but the reporter is a two-year-old, so they won't.

## Safety, resource, and ships-to-production

Unbounded work, unvalidated input reaching a shell, unpinned remote code, and files that reach the
production bundle or the clone weight without being needed there.

## Cross-file agreement held by prose

CLAUDE.md is explicit that a "keep in sync with X" comment marks a defect rather than a mitigation.
Kept only where the two sides can diverge *silently* and ship — release versions, ESLint's paired
restricted-import blocks, policy values re-declared in specs. One of these has already drifted.

### [Types] `payloadStore`'s narrowed schema silently mistypes the master-key row — document or restructure the dual-schema trick

**File(s):** `web/src/lib/secureStorage.ts` (`SecureDb`/`SecretPayloadDb` lines 34–46,
`getDb`/`payloadStore` lines 61–62) @ cd04c367

**Priority:** P4

#### Problem

The same IndexedDB store is typed two different ways: `getDb` sees `SecureDb`
(`value: CryptoKey | SecretPayload` — the truth: the store holds both the master key and secret
payloads), while `payloadStore` sees `SecretPayloadDb` (`value: SecretPayload` — a lie for the
`master-key` row):

```ts
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE);
const payloadStore = idbKvStore<SecretPayloadDb>(DB_NAME, STORE);
```

The narrowing is a type assertion in module form — nothing stops `payloadStore.get(MASTER_KEY_ROW)`
from typechecking as `SecretPayload | undefined` while returning a `CryptoKey` at runtime. Today it
happens to be safe because secret names never collide with `'master-key'` and `webLoad` (lines
128–134) runtime-validates with `isSecretPayload` anyway — but neither the safety argument nor the
reason for two schemas is written down, in a file that otherwise explains every non-obvious decision
at length. Per the conventions, an unvalidated-looking narrow at a non-boundary needs either removal
or a WHY.

#### Proposed solution

Cheapest: a two-line comment on `SecretPayloadDb`/`payloadStore` stating the contract — "same store
as SecureDb, narrowed to the secret rows; safe because the secret name (`API_KEY`) never equals
`MASTER_KEY_ROW`, and webLoad still runtime-validates" — plus noting the payoff (put() through
`payloadStore` cannot write a CryptoKey). Stronger: type `payloadStore` against `SecureDb` and let
`webLoad`'s existing `isSecretPayload` guard do the narrowing; that deletes `SecretPayloadDb`
entirely at the cost of a wider `put` signature. Either resolves the silent mismatch; the comment
route preserves the current (real) typing benefit.

## Documentation that actively misdirects

Not cosmetic doc rot. Each of these is read by an agent or a contributor *as instruction* and sends
them somewhere wrong — a source map behind the code it describes, a retired API contract, a dead
link in every generated tree, prescribed scripts that do not exist.

### [Docs] architecture skill's "file-by-file source map" and route table have drifted well behind `web/src/`

**File(s):** `.ruler/skills/architecture/SKILL.md` (source map lines 62–135, route table lines
147–161, tech-stack lines 18–19 and 55–56, `server/rateLimit.ts` row line 133) @ cd04c367

**Priority:** P2

#### Problem

The skill advertises a "file-by-file source map of web/src/" (description, line 3) and is the
designated navigation reference, but large module families are absent or misdescribed:

* **`lib/drawing/`** — the map (lines 66–90) omits `aiImage.ts`, `aiImageResponse.ts`,
  `earlyBoot.ts` (the ADR-0072 pre-hydration boot the run-splotch skill leans on), `folderSave.ts`
  (named at line 81 as if mapped, but has no row), `magicBrush.ts`, and `perf.ts` (named at line 155
  of the profiling skill as the shared marks flag).
* **`lib/state/`** — omits `aiGeneration.svelte.ts`, `aiKey.ts`, `modal.svelte.ts`,
  `saveFolder.svelte.ts`, `ui.svelte.ts`.
* **`lib/actions/`** — lists only `dragToClear` and `modalDialog` (lines 105–106); missing
  `launchGuard`, `pinchTextZoom`, `pinchZoom`, `pointerCapture`, `scribbleGuard`, `spreadTracker`.
* **`lib/server/`** — the rows at lines 127–133 omit `http.ts` (the shared
  `throttled()`/`readJsonBody` helpers the api skill calls mandatory), `github.ts` (the ADR-0060
  seam), `config.ts`, `generationAuthorization.ts`, `rateLimitKeys.ts`, `rateLimitPolicy.ts`,
  `securityHeaders.ts`, `usage.ts`. The `server/rateLimit.ts` row (line 133) still reads "per-token
  rate limiting for the image generation endpoint" — it is the generic per-key sliding window
  backing seven endpoint policies in `rateLimitPolicy.ts`.
* **`lib/` top level** — no rows for `adminFormat.ts`, `aiCredential.ts`, `apiHeaders.ts`,
  `appVersion.ts`, `devHarness.ts`, `deviceInfo.ts`, `deviceReport.ts`, `errorLog.ts`, `fonts.ts`,
  `haptics.ts`, `idb.ts`, `idle.ts`, `imagePrefetch.ts`, `inviteLink.ts`, `latestRequest.ts`,
  `notchBand.ts`, `palette.ts`, `safeArea.ts`, `storageKeys.ts`, or the `plugins/` facades that
  mobile/native.md describes at length.
* **Route table** (lines 147–161) — missing `/api/report` and `/api/csp-report`, both live routes
  (`web/src/routes/api/report/`, `web/src/routes/api/csp-report/`) fully documented in the api
  skill.
* **Tech stack** — lines 18–19 say Vite "Injects three compile-time constants: `__APP_VERSION__`,
  `__BUILD_TIME__`, `__NATIVE_API_BASE__`"; `web/defines.ts` lines 17–22 define six, and the three
  omitted (`__IS_CAPACITOR__`, `__PERF_MARKS__`, `__DEV_HARNESS__`) include load-bearing gates other
  skills document (the tree-shaking gate in mobile/native.md lines 58–60 and the marks flag in
  profiling lines 152–157). Line 55–56 describes Maestro as "Android smoke test" only; the iOS smoke
  (`npm run test:ios`) has existed since the ios-deploy workflow landed.

An auditor or contributor using this map concludes files don't exist, or places new code where an
unlisted sibling already lives.

#### Proposed solution

Refresh the map against the actual tree (the listing above is the checklist), add the two missing
route rows, fix the `rateLimit.ts` description, say "six compile-time constants" (or name the file
`web/defines.ts` and drop the count per the no-mutable-facts convention), and mention iOS beside
Android in the Maestro bullet. Consider a drift-guard test comparing `ls web/src/lib` module names
against the map's cited paths so the next split fails CI instead of silently rotting — the repo's
own "cross-file agreement is never maintained by prose" convention applied to its own docs.

### [Docs] architecture route table describes generate-image's retired "base64 PNG" contract, contradicting the api skill

**File(s):** `.ruler/skills/architecture/SKILL.md` (line 150) @ cd04c367

**Priority:** P2

#### Problem

The `/api/generate-image` row says:

> Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image.

The api skill (`.ruler/skills/api/SKILL.md` lines 48–65, ADR-0064) documents the current contract
precisely: **raw image bytes as the body** (WebP preferred, `Content-Type` allowlist, style as a
`?style=` query enum, credential in a header), with multipart as a labelled legacy shim. "base64
PNG + style prompt" matches neither the current nor even the legacy multipart shape, and two
generated instruction files now contradict each other on the same endpoint — the exact
"contradictory instructions" failure ruler exists to prevent.

#### Proposed solution

Rewrite the row to defer to the api skill for the contract, e.g.: "Serverless function (Netlify).
Raw drawing bytes in, stylized image out — see the `api` skill for the full contract. Token-gated +
rate-limited. Not bundled for native." Route-table rows shouldn't re-state wire details a sibling
skill owns.

### [Docs] mobile and profiling docs prescribe npm scripts that don't exist (`ios:run:choose`, `ios:run:ipad`, `npm run ios`)

**File(s):** `.ruler/skills/mobile/ios.md` (lines 65, 143),
`.ruler/skills/profiling/ipad-device-profiling.md` (line 605) @ cd04c367

**Priority:** P3

#### Problem

Three commands cited as the way to run the app on iOS hardware are not in `package.json`:

* `ios.md:65` — "or `npm run ios:run:choose` and choose the device at the prompt". No such script;
  the chooser behavior belongs to plain `ios:run` (scripts-info line 305: "prompting to choose the
  iOS simulator or connected device").
* `ios.md:143` — "covers all Debug builds — `ios:run`, `ios:run:ipad`, `cap:ios` Run". No
  `ios:run:ipad`; the real variants are `ios:run:emulator` and `ios:run:device` (package.json lines
  147–148).
* `ipad-device-profiling.md:605` — "Build + run the native app with marks on:
  `PERF_MARKS=true npm run ios`". No `ios` script; should be `ios:run`.

Each fails with `npm error Missing script` at the exact moment a user is mid-runbook with a device
cabled up. The repo's own guidance ("run `npm run info` before guessing at a script") exists because
of this class of drift — the docs shouldn't require it.

#### Proposed solution

Replace with the real script names (`ios:run`; `ios:run:emulator` / `ios:run:device`;
`PERF_MARKS=true npm run ios:run`). A tiny repo-script test that extracts `npm run <name>` tokens
from `.ruler/**` and asserts each (or its namespace prefix) exists in `package.json` scripts would
fence the whole category — this audit found these three by exactly that grep.

### [Docs] `.claude/rules/testing.md` misstates what `npm test` runs (omits `test:scripts`)

**File(s):** `.claude/rules/testing.md` (lines 22–23); `package.json` (line 46) @ cd04c367

**Priority:** P3

#### Problem

The path-scoped testing rule — loaded into context whenever an agent edits any test file — says:

```markdown
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
```

but `package.json` line 46 is:

```json
"test": "npm run test:unit && npm run test:asset-gen && npm run test:scripts && npm run test:e2e",
```

The `test:scripts` tier (repo-automation tests in `scripts/tests/` — including the very
workflow-hygiene, labels, and claude-permissions tests that guard this section's files) is missing
from the rule. CLAUDE.md's command table has the correct four-tier description, so the two
instruction surfaces disagree, and an agent following the rule may conclude `scripts/tests/` is not
part of `npm test` and skip running it. This is also an instance of the repo's own comment
convention violation: the rule restates a mutable composition owned by `package.json` instead of
naming the owner.

#### Proposed solution

Update line 22 to include `test:scripts` — or better, stop enumerating: "`npm test` runs every CI
tier (see the `test` entry in package.json `scripts-info`); the native smokes (`test:android`,
`test:ios`) are deliberately excluded…". The pointer form can't drift when a fifth tier is added.
`.claude/rules/` is edit-in-place (not ruler-generated), so this is a direct one-file fix.

### [Docs] CONTRIBUTING.md "Release process" predates the three-phase model — it describes exactly the flow ADR-0077 was written to kill

**File(s):** `docs/CONTRIBUTING.md` (lines 226–230) @ cd04c367

**Priority:** P3

#### Problem

The section reads, in full:

```
See the `/release` slash command in `.claude/skills/release/SKILL.md`. The short version:
`npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on
the tag.
```

Two problems:

1. **It omits phases 2 and 3.** `docs/adrs/0077-three-phase-release-verified-artifact-publish.md`
   and `releases/README.md:44–54` define shipping as three ordered phases — `/release` → `/build` →
   `/publish-artifacts` (`npm run release` / `android:bundle`+`ios:ipa` / `release:publish`) —
   precisely because the "release does everything" mental model shipped a stale 1.2.0 binary on the
   v1.4.0 GitHub Release. A contributor following CONTRIBUTING's "short version" stops after phase 1
   and leaves the GitHub Release permanently binary-less (`release.mjs` now "attaches nothing,
   unconditionally" per the ADR).
2. **The `android-deploy.yml` mention misleads.** In a section titled "Release process", "the
   `android-deploy.yml` CI workflow fires on the tag" reads as the deployment step. The workflow is
   a tag-gated *Maestro smoke test* ("Runtime smoke test for the Android *deployment*… Tag-only by
   design", `.github/workflows/android-deploy.yml:1–9`) — it deploys nothing; store artifacts are
   built locally by `/build`.

#### Proposed solution

Rewrite the section to mirror `releases/README.md`'s three-phase table (or simply link it as the
authoritative source and keep one sentence: "Shipping is three ordered phases — `/release`,
`/build`, `/publish-artifacts` (ADR-0077); see `releases/README.md`."). If the smoke test stays
mentioned, name it as such: "pushing the `v*` tag also triggers the Android/iOS launch smoke
workflows."

### [Docs] pr-screenshots links ADR-0046 one directory too shallow — dead link in every generated location

**File(s):** `.ruler/skills/pr-screenshots/SKILL.md` (line 22) @ cd04c367

**Priority:** P2

#### Problem

Line 22 links `[ADR-0046](../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)`. From
the generated `.claude/skills/pr-screenshots/SKILL.md` this resolves to `.claude/docs/adrs/…`, and
from `.agents/skills/pr-screenshots/` to `.agents/docs/adrs/…` — neither exists. Every other skill
in the tree that reaches the repo root uses three levels (`mobile/android.md:11` →
`../../../docs/COMPATIBILITY.md`, `burn-down-backlog:21` → `../../../.github/labels.yml`), so this
is a one-off typo, but it dead-ends the pointer to the ADR that holds "the full rationale, sources,
and rejected options" the skill explicitly declines to restate inline.

#### Proposed solution

Change to `../../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md` and run
`npm run ruler:apply`. The relative-link drift-guard test proposed in the audit-conventions finding
would have caught this too.

### [Maintainability] Audit skills link `audit-conventions.md` with a path that is broken in the `.agents/` tree (and inside `.ruler/` itself)

**File(s):** `.ruler/skills/code-audit/SKILL.md` (line 63), `.ruler/skills/extract-audit/SKILL.md`
(line 53), `.ruler/skills/lighthouse-audit/SKILL.md` (line 112),
`.ruler/skills/session-audit/SKILL.md` (line 175), `.ruler/skills/dependency-health-audit/SKILL.md`
(line 229), `.ruler/skills/dependency-update-audit/SKILL.md` (lines 28 vs 125),
`.ruler/skills/workflow-audit/SKILL.md` (line 118) @ cd04c367

**Priority:** P2

#### Problem

Skills are copied verbatim into **both** `.claude/skills/<name>/` and `.agents/skills/<name>/`
(agent-files.md lines 10–11). Six audit skills link the shared conventions as
`[`.claude/audit-conventions.md`](../../audit-conventions.md)`. That relative path only resolves
from `.claude/skills/<name>/`; from `.agents/skills/<name>/` it points at
`.agents/audit-conventions.md`, which does not exist (`.agents/` contains only `skills/` and
`skill-notes/`), and from the `.ruler/` source itself it points at a nonexistent
`.ruler/audit-conventions.md`. A Codex session following the link (the explicitly supported consumer
per ADR-0058 and knowledge-map.md lines 3–5) hits a dead path for the conventions that define the
finding format, the AUDIT-LOG entry, and the self-heal rule.

The correct form already exists in the same tree — `dependency-update-audit/SKILL.md:28` uses
`(../../../.claude/audit-conventions.md)`, which resolves to the repo-root
`.claude/audit-conventions.md` from **both** generated locations — but the same file then uses the
broken `(../../audit-conventions.md)` form at line 125, so even one skill is internally
inconsistent.

#### Proposed solution

Normalize every audit-conventions link in `.ruler/skills/**` to the
`../../../.claude/audit-conventions.md` form (or drop the hyperlink and keep the plain backticked
path, which several skills — `vet-audits`, `fix-audits`, `skills-guide` — already do successfully).
A cheap drift-guard in `scripts/tests/` that resolves every relative markdown link in the generated
`.claude/skills/**` and `.agents/skills/**` and fails on a missing target would catch this whole
class (see also the pr-screenshots and knowledge-map findings below).

## Coverage gaps on load-bearing paths

Kept where the untested surface is one whose silent breakage is expensive and not otherwise
observable.

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
