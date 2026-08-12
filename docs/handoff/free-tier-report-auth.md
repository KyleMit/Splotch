# Handoff — free-tier picture report is rejected with 403

> 2026-08-12 · branch `claude/free-tier-report-auth` · issue
> [#960](https://github.com/KyleMit/Splotch/issues/960) · give `/api/report-image` the free
> installation-id credential that `/api/generate-image` already accepts, so a free-tier user can
> flag an AI picture

## Objective & non-goals

**Objective.** `POST /api/report-image` answers `403 Invalid access token` for anyone who generated
on the free tier, so the safety-report flow is unreachable on the default no-setup path. Give it the
third credential generation already takes — a well-formed `X-Installation-Id` — with its own rate
limit, plus tests and the `docs/API.md` correction. Full write-up, including the open decision
below, is in issue #960.

**Non-goals.**

* Do not touch the CSP fix on PR [#947](https://github.com/KyleMit/Splotch/pull/947). It is green,
  reviewed, and fixes a total outage; it merges on its own.
* Do not do the blob-vs-object-URL refactor. That is issue
  [#949](https://github.com/KyleMit/Splotch/issues/949) and is gated on an iOS simulator probe.
* Do not widen reporting past parity with generation. The goal is "reporting accepts what generation
  accepts", not a new auth model.

## State

Branch `claude/free-tier-report-auth`, **stacked on** `claude/ai-image-report-flag-error-ietoix` (PR
#947) rather than cut from `main` — the report E2E needs `enforceProductionCsp`, which only exists
on that branch. Rebase onto `main` once #947 merges.

| sha      | what                                                           | whose   |
| -------- | -------------------------------------------------------------- | ------- |
| f29adb8b | CSP `connect-src 'self' blob:` + `enforceProductionCsp` helper | PR #947 |
| dd15de78 | ADR typo from review                                           | PR #947 |
| 50e6662b | route-fallback comment direction from review                   | PR #947 |

**No implementation commits for this work yet — nothing has been written.** The research below is
the entire deliverable so far.

## Decisions made (and why)

* **Separate PR from #947.** #947 fixes a total outage for every user and is already green and
  reviewed; this is a server auth change that deserves its own review. Merge #947 first.
* **The bug is confirmed, not suspected.** The user hit it live off one of the 10 free uses. The
  supporting deduction: the picture generated successfully in that same session, so the credential
  satisfied `generate-image`; the only mode where generation succeeds and the report 403s is the
  free path.
* **The `403` is itself evidence PR #947 works.** That response can only come from the server, which
  the request never reached before the `blob:` grant — the upload now gets through and hits the next
  gate.
* **Not reverted, but rejected as a framing:** treating this as a client bug. The client is correct
  to have no token on the free tier; the server is the side missing a branch.

## Unverified assumptions

1. **The user was testing a deploy preview of #947, not production.** Inferred from the fact that
   production still serves `connect-src 'self'` and would fail earlier. Never confirmed with them,
   and it doesn't change the fix — but if they were on production, the reasoning above needs
   revisiting.
2. **Adding the server branch is sufficient.** `AiImageReport.svelte` does *not* currently send
   `X-Installation-Id` at all — the client half has to change too. Check `buildRequest` in
   `aiImage.ts` for the shape to copy before assuming a one-file fix.
3. **`isInstallationId` is shape-only** (`/^[a-f0-9]{64}$/`) — read but not exercised. It validates
   format, not that a grant exists, which is exactly what the open decision below turns on.
4. **Netlify Blobs writes work in production.** Still true and still unproven: no report has ever
   reached the server, so the blob write → GitHub issue path is unexercised in production. Tracked
   in #949.

## Done & verified

* Read the whole auth path on both endpoints and confirmed the asymmetry (three credential modes vs
  two).
* Confirmed free generations are **not** native-only: `webInstallationId()` uses `localStorage`
  (`freeGenerations.svelte.ts:20`).
* Confirmed the production endpoint is reachable and configured — an unauthenticated `POST` to
  `https://splotch.art/api/report-image` returns `403 {"ok":false,"error":"Invalid access token"}`,
  so `isReportingConfigured()` is true in production.
* Confirmed CORS is not involved: a preflight from `Origin: capacitor://localhost` returns 204 with
  `X-Access-Token` allow-listed.
* PR #947 CI green on 50e6662b (8 checks passed, 2 WebKit commit gates skipped); both review threads
  replied to and resolved.
* **Not run for this work:** no tests, no `npm run check` — no code has been written.

## Risks & next 3 steps

**Risk.** The open decision below is a security call, not a mechanical one. Do not pick it silently
— the PR must state which was chosen and why.

1. **Decide the credential strength** (issue #960 has both options with their evidence): (a)
   shape-only installation id + per-IP rate limit, precedent being the already-unauthenticated
   `/api/report`; or (b) require an existing free-generation grant record, tighter because reporting
   also writes image blobs to storage. Lean (b) unless the grants read proves awkward on that path.
2. **Implement**: a free branch in `authorizeImageReport` mirroring
   `generationAuthorization.ts:60-77`; thread `INSTALLATION_ID_HEADER` through
   `report-image/+server.ts` the way `generate-image/+server.ts:168-173` does; send it from
   `AiImageReport.svelte` when both credentials are absent; add a `reportImageFreeBucket` to
   `rateLimitKeys.ts` (lint-enforced source, ADR-0014) with a matching `rateLimitPolicy` entry.
3. **Cover and document**: accept/reject units in `imageReportAuthorization.test.ts`, the free
   credential in the report E2E (`ai-result.spec.ts`, behind `enforceProductionCsp`), extend
   `tools/api-smoke/api-smoke.mjs`, and fix `docs/API.md:218` to list all three credentials. Then
   open the PR against `main` once #947 has merged.

## Reread first

* `web/src/lib/server/imageReportAuthorization.ts` — the whole file, 46 lines; the missing branch
* `web/src/lib/server/generationAuthorization.ts:60-77` — the free branch to mirror
* `web/src/routes/api/report-image/+server.ts:22-27` vs
  `web/src/routes/api/generate-image/+server.ts:168-173` — call sites, one passing the installation
  id and one not
* `web/src/lib/components/AiImageReport.svelte:67-69` and `web/src/lib/drawing/aiImage.ts:266-267` —
  the client's credential choice
* `web/src/lib/server/freeGenerationGrants.ts:56` — `isInstallationId`, and the grant records option
  (b) would read
* `docs/API.md:218` — the sentence that hides the gap
* `.claude/rules/server-api.md` — `apiHandler`/`fail`/`throttled` conventions and the
  `rateLimitKeys.ts` contract; the `api` skill routes to `docs/API.md`
* Issues #960 (this work), #949 (iOS verification), PR #947 (the CSP fix underneath it)
