# Quality Commitments

The bar Splotch holds on each axis of quality, what enforces it, and — the load-bearing part — where
nothing enforces it yet.

This is a ledger, not a mission statement. Each entry names a falsifiable commitment and the gate
that fails when it breaks. An entry whose **Enforced by** reads "nothing yet" is not an aspiration;
it is a known hole, stated so it stays visible instead of being mistaken for covered ground. The
format is borrowed from [`MOBILE/compliance.md`](MOBILE/compliance.md), which does the same job for
store policy.

Categories are grouped as **Product** (what it is like to use), **Promise** (what we commit to a
parent), and **Practice** (how it is built). Every category name completes the sentence "best in
class ___" — a name that does not is a category that has not been thought through.

## Status at a glance

| Category             | Group    | Enforcement                                   |
| -------------------- | -------- | --------------------------------------------- |
| usability            | Product  | Partial — behavior specs, no ergonomic bar    |
| design system        | Product  | Gated                                         |
| accessibility        | Product  | Gated                                         |
| illustration         | Product  | Gated                                         |
| performance          | Product  | Gated for interaction; none for load          |
| resilience           | Product  | Partial — pieces exist, no failure-path suite |
| storefront           | Product  | **Nothing yet**                               |
| privacy              | Promise  | Gated, with two open defects                  |
| content safety       | Promise  | Gated                                         |
| security             | Promise  | Partial — see gaps                            |
| compliance           | Promise  | Gated                                         |
| child wellbeing      | Promise  | **Nothing yet**                               |
| architecture         | Practice | Gated                                         |
| code quality         | Practice | Gated                                         |
| testing              | Practice | Gated, but no coverage measurement            |
| compatibility        | Practice | Gated                                         |
| documentation        | Practice | Gated for generated output only               |
| developer experience | Practice | Gated                                         |

## Product

### usability

**Commitment.** A two-year-old can draw without adult help. Every control is reachable one-handed,
forgiving of imprecise contact, and wordless.

**Enforced by.** The `flows-*.spec.ts` family, `multitouch.spec.ts`,
`engine-pointer-recovery.spec.ts`, and `dialogTabletScaling.test.ts` assert that the flows work.

**Known gaps.** Nothing states a minimum target size, a gesture-forgiveness threshold, or a maximum
step count for a task — the specs prove behavior, not ergonomics, so a control could shrink below
usable and stay green. Issue 1103 (rejecting forearm-sized contact patches) is open.

### design system

**Commitment.** Every surface draws from one token vocabulary. No ad-hoc color, size, radius,
shadow, or easing values in component styles.

**Enforced by.** `npm run lint:tokens` and `npm run gen:tokens:check`, both in the `quality` CI job;
`design.spec.ts`; `chipInk.test.ts` (exhaustive dual-theme contrast proof for chip ink);
`scrollbar-chrome.spec.ts`; the public `/design` styleguide as the rendered reference.

**Known gaps.** Issue 1020 — a harmonization pass to standardize the design language across surfaces
that predate the current token set.

### accessibility

**Commitment.** Adult-facing surfaces hold WCAG 2.1 AA. No serious or critical axe violation ships.

**Enforced by.** `a11y.spec.ts` runs axe-core across `/privacy`, `/changelog`, `/beta` (both
platform tabs), `/feedback`, `/design`, `/admin` (both auth states), the Settings dialog, the locked
Parent Center card, the refusal confirmation, and the parental gate. It also hand-computes contrast
ratios for the cases axe reports as `incomplete` and therefore never fails on — short text nodes,
`::placeholder` pseudo-elements, `aria-hidden` operand digits, and overlapping-background dialogs.

The toddler-facing canvas chrome is deliberately out of scope: its rules (giant wordless buttons, no
reading order) are not WCAG's.

**Known gaps.** No public accessibility statement, which the European Accessibility Act has required
of consumer apps serving EU users since 2025-06-28. Issue 568 — no keyboard or assistive-technology
path to clear the canvas.

### illustration

**Commitment.** Every coloring page ships clean outlines, theme-correct fills, and no shapes the
generator invented that are absent from the source.

**Enforced by.** `check:coloring-outline-quality`, `check:coloring-invented-shapes`,
`check:coloring-night-halo`, `check:coloring-fill-eyes`, `check:coloring-fill-drift`, and
`check:coloring-golden-scores` — a scored quality bar, not just a smoke test.
`check:assets:manifest` turns silent binary churn into a reviewable text diff and guards the
invariant that a night-only fill pass leaves light-mode bytes untouched. The pipeline carries its
own decision records in `tools/asset-gen/docs/`.

**Known gaps.** Issue 795 — catalog expansion queued for six shipped books and three new sections.
Issue 264 — upscale and resolution audit against device DPR.

### performance

**Commitment.** Drawing holds its frame budget on the supported device floor, and startup stays
inside a reviewed byte budget.

**Enforced by.** The `perf:*` harness across web, Android, and iOS; the committed performance matrix
with `check:matrix-staleness`, which compares the content digest of `web/src` against the commit a
cell claims to measure and refuses to call a stale cell current; the WebKit commit gates (fast,
retry, and full legs); the undo commit-P95 gate; and `check-bundle-budgets.mjs`, which fails the
build above 525,000 bytes of startup JS/CSS, 75,000 bytes for the largest lazy chunk, or 7,000,000
bytes of stripped native export. `check-pwa-precache.mjs` guards precache integrity.

**Known gaps.** Load performance has no gate — the `lighthouse-audit` skill is manual and nothing
fails when first paint regresses. Every number is lab data captured on maintainer-owned hardware (an
iPad and an SM-G990U1); the cheap Android tablet that represents the real device floor is not in the
matrix. Issues 1199 and 1197 — dialog/theme frame cost and rotation cost.

### resilience

**Commitment.** Every degraded path returns usable app state rather than a dead end — offline,
provider outage, exhausted quota, denied storage, or a crash mid-stroke. The child's work survives.

**Enforced by.** `early-boot.spec.ts` and `paper-texture-boot.spec.ts` cover the startup path;
`pwa-registration.spec.ts` covers service-worker registration; `engine-pointer-recovery.spec.ts`
covers interrupted input. `idb.ts` requests persistent storage via `navigator.storage.persist()` and
resets its memoized promise on rejection; `storage.ts` handles `QuotaExceededError`.

**Known gaps.** There is no systematic failure-path suite. Nothing asserts what a full IndexedDB, a
dead AI provider, a denied storage permission, or a crash mid-stroke actually does to the drawing.
No offline end-to-end test exists. The pieces are present; the guarantee is not tested.

### storefront

**Commitment.** The store listing represents the app accurately and earns the install.

**Enforced by.** Nothing yet. `gen:store-assets` and `gen:store-assets:frames` produce the
screenshots, and `store-assets/STORE-LISTING-ANDROID.md` and `STORE-LISTING-IOS.md` hold the
pre-committed metadata answers, but no check measures quality, accuracy, or conversion.

**Known gaps.** The whole category. Across the project's history, five commits touch store assets
exclusively — against 632 that touch documentation exclusively. Everything behind the install button
is polished; the surface that decides whether anyone presses it is not. Issue 851 — submission
readiness.

## Promise

### privacy

**Commitment.** No accounts, no analytics SDKs, no advertising identifiers, no child name, email, or
location. Everything that leaves the device is disclosed in `/privacy` in parent-readable terms,
with retention stated in both halves — what we keep and what the provider keeps.

**Enforced by.** `requiredNativePageProblems` and `requiredNativePageLinkProblems` in
`tools/mobile/check-static-bundle.mjs` fail `build:cap` if `privacy.html` is missing from the static
export or if nothing in the shipped bundle links to it (ADR-0120). Retention windows are imported
into the page as constants (`IMAGE_REPORT_RETENTION_DAYS`, `USAGE_RECORD_RETENTION_DAYS`) rather
than restated in prose, so the disclosure cannot drift from the cleanup. ADR-0105 records the
app-purpose one-way pseudonym; ADR-0114 records provider retention.

**Known gaps.** Two open defects:

* `/api/csp-report` logs `documentURL` verbatim to the Netlify function log. Invite links carry the
  AI access token as a query parameter, and `captureAiAccessTokenFromUrl()` strips it only after an
  awaited persistence write — so a violation fired during load reports the full URL, token included.
  Strip `search` and `hash` before logging.
* No labeled data-retention policy section. The amended COPPA Rule requires a written retention
  policy — purposes, business need, deletion timeframe — incorporated directly into the privacy
  notice rather than linked. The retention facts exist but are distributed across four sections. The
  compliance deadline was 2026-04-22.

### content safety

**Commitment.** A generated picture is appropriate for a two-year-old, or it is refused with a
message the child can act on. The prompt surface is closed — a child cannot type free text into a
generator.

**Enforced by.** `openaiSafety.ts` with `openaiSafety.test.ts` and `openai.test.ts` classify a
response as image, safety refusal, or empty failure. ADR-0023 records why the Responses API is used
instead of `/v1/images/edits`: the latter cannot express the distinction, and on this repo's
red-team corpus it returned a finished image for a drawn gun. The report flow requires a gated
confirmation naming the evidence being sent (ADR-0104), and reports expire on a daily cleanup.

**Known gaps.** Issue 883 — no local triage flow that ends in a red-team commit. Nothing re-runs the
red-team corpus when the provider updates its model, so a safety regression upstream would arrive
silently.

### security

**Commitment.** Credentials are never guessable, never logged, and never longer-lived than they need
to be. Every endpoint resists brute force and abuse.

**Enforced by.** `securityPolicy.ts` with `securityPolicy.test.ts` hashes the exact inline script
bodies and fails on template drift; `securityHeaders.ts` with its test pins HSTS, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, and frame denial; `csp.spec.ts` checks the delivered
policy. Admin secrets compare in constant time. Credential endpoints carry per-IP sliding-window
limits that peek before the check so a legitimate caller never spends budget.
`pnpm audit --audit-level=critical` runs in the `quality` job.

**Known gaps.** The largest concentration of gaps in this ledger:

* **Admin sessions cannot expire or be revoked.** `sessionToken()` is
  `HMAC(secret,
  'admin-session-v1')` — a constant. Every session ever minted is the same string on
  every device, and revocation means editing `SESSION_LABEL` and redeploying (issue 220).
* **Rate limiting is per-instance.** The bucket map lives in module scope on a serverless function,
  so horizontal scale-out and cold starts hand an attacker a fresh budget (issue 1097). Moving it to
  Blobs must hash or truncate the IP first — durable raw IPs on a children's app would trade this
  gap for a privacy one.
* CI fails only on `critical` advisories; `high` passes silently.
* No SAST, no secret scanning, and no `SECURITY.md` — a researcher has no private channel and would
  have to open a public issue.
* `/api/csp-report` is the only route with no test file, and it is the only one accepting
  unauthenticated public input.

### compliance

**Commitment.** Every store guideline and children's-privacy obligation that shaped this codebase is
quoted verbatim, answered with the decision that satisfies it, and traceable to the commit where it
landed.

**Enforced by.** [`MOBILE/compliance.md`](MOBILE/compliance.md) — the guideline table, per-store
required-or-defensive marking, and provenance. `check-static-bundle.mjs` enforces the privacy-page
assertions at build time. The manifest ships no identifier from the Play Families prohibited list,
requests no location permission, and sets `android:allowBackup="false"`.

**Known gaps.** The COPPA retention-policy item above. The ledger's own open items: issues 844, 708,
and 851, plus the OpenAI zero-data-retention grant, which is an account action outside this repo.

### child wellbeing

**Commitment.** Not yet written.

**Enforced by.** Nothing yet.

**Known gaps.** The entire category. The decisions exist and are consistent — wordless UI, no ads,
no streaks, no notifications, no engagement loops, every data-out operation gated behind an adult —
but they were made by instinct rather than against a stated bar, so nothing prevents the next
feature from quietly violating them. This is the one category that can veto a change scoring
perfectly on every other axis, and it is the one with no home.

## Practice

### architecture

**Commitment.** Every decision that chose an approach over real alternatives is recorded before the
code depending on it lands.

**Enforced by.** 143 numbered records in `docs/adrs/`, `npm run check:adrs`
(`tools/adrs/check-adr-integrity.mjs`), and the `adr-integrity.yml` workflow.

**Known gaps.** Decision debt rather than design debt: sixteen open issues carry
`triage:needs-decision`, several untouched since 2026-07-15. The records are excellent; the queue of
undecided questions is the problem.

### code quality

**Commitment.** New code reads like the code around it. No dead exports, no unformatted files, no
type errors, no duplicate declarations.

**Enforced by.** `npm run check:quality` runs the whole set and reports every failure in one pass:
`format:check`, `check` (svelte-check), `lint` (eslint), `check:svg-assets`, `ruler:check`,
`check:ideas-review`, `gen:tokens:check`, `lint:tokens`, `lint:dead` (knip, on files, exports,
types, and duplicates), `check:assets:manifest`, `scrapbook:check`, and `pnpm audit`. The
`format-edited-file.sh` PostToolUse hook routes each edited file through Prettier or dprint.

**Known gaps.** None material.

### testing

**Commitment.** Three tiers — Vitest unit, Playwright end-to-end, Maestro native smoke on both
platforms — and a suite whose signal can be trusted rather than re-run until green.

**Enforced by.** 181 unit, 65 end-to-end, and 167 tool test files. `playwright-flaky-reporter.ts`
surfaces flake; the WebKit commit gates carry a bounded retry leg rather than an open one; ESLint
carries vacuous-test rules under both the vitest and playwright spellings so a helper that asserts
nothing fails review.

**Known gaps.** **No coverage measurement anywhere.** `@vitest/coverage-v8` is not installed,
`web/vitest.config.ts` declares no coverage block, and no CI job applies a threshold — so with 413
test files, the question "what is untested?" has no answer. Issue 1094 — whether Firefox earns an
engine-smoke leg is undecided.

### compatibility

**Commitment.** The native apps behave the same as the web app on every shipped surface, and every
browser and OS version named in [`COMPATIBILITY.md`](COMPATIBILITY.md) runs the current build.

**Enforced by.** `web/src/browserFloor.test.ts` guards the floor against drift; `COMPATIBILITY.md`
carries the per-API risk register; `nativeExcludedRoutes.ts` and `check-static-bundle.mjs` keep
server routes and native code out of the static export; `android-config.test.mjs` guards native
config; Maestro smoke runs on Android and iOS.

**Known gaps.** Two live parity failures: issue 1313 (Notch Band fails to paint on most Android cold
starts — `layout.safeArea` keeps a stale zero) and issue 1312 (iPadOS 26 reports a 32px top inset,
clearing the 30px threshold and painting a cutout-less band). Issue 248 — versioned API capabilities
for old native apps still installed.

### documentation

**Commitment.** Generated agent instructions never drift from their `.ruler/` sources, and a doc is
updated in the same change that invalidates it.

**Enforced by.** `ruler:check` reruns the full generation pipeline and fails if output changed;
`check:skill-refs` fails on the wrong invocation sigil for the tree it appears in; `check:adrs`
guards record integrity; `check:matrix-staleness` guards performance claims; `scrapbook:check`
guards the published index.

**Known gaps.** The generated tree is gated; the hand-written reference set is not. Nothing fails
when `ARCHITECTURE.md` describes a file that moved, so staleness there is caught only by a reader
noticing.

### developer experience

**Commitment.** One command per task, discoverable without reading the source, reproducible across
macOS and Linux, and regenerating deterministically.

**Enforced by.** ADR-0019 requires a `scripts-info` description per script, and `npm run info`
prints them. `ruler:apply` and `ruler:check` keep both provider trees deterministic.
`tools/tests/package-manager.test.mjs` fails if any CI, hook, or bootstrap file starts installing
with npm instead of pnpm. `check:github-actions` and `workflow-hygiene.test.mjs` guard the workflow
set.

**Known gaps.** Dependency maintenance is manual — `dependency-health-audit` is a skill someone must
choose to run, not a gate, and nothing sets a cadence for it.

## Maintaining this ledger

Update an entry in the change that moves it. Adding a gate means moving a line out of **Known gaps**
and into **Enforced by** in the same commit that adds the check; a new commitment with no gate is
added with "nothing yet" stated plainly rather than left implied.

The status table at the top is derived from the entries below it, not maintained separately — when
an entry's enforcement changes, change the row too.
