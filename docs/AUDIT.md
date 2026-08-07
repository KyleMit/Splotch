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

## Documentation that actively misdirects

Not cosmetic doc rot. Each of these is read by an agent or a contributor *as instruction* and sends
them somewhere wrong — a source map behind the code it describes, a retired API contract, a dead
link in every generated tree, prescribed scripts that do not exist.

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
