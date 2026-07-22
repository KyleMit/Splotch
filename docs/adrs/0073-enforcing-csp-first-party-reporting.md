# ADR-0073: Enforcing CSP with a First-Party Violation Receiver

**Status:** Active. **Date:** 2026-07

## Context

The site had carried a `Content-Security-Policy-Report-Only` header since the staged rollout plan of
issue #235. Report-only provides zero protection, and with no `report-uri`/`report-to` wired,
violations surfaced only in end users' consoles — the "tighten once real traffic is clean" plan had
no data source. Issue #457 called for finishing the rollout.

Alternatives considered for the violation data source:

* **A third-party reporting service** (report-uri.com and kin) — rejected: the app deliberately
  ships no third-party telemetry (see the `handleError` hooks; the Netlify function log is the only
  sink).
* **A soak period on report-only with reporting wired, flip later** — rejected in favor of flipping
  now because a deliberate Playwright sweep of every app surface (draw/undo/clear, coloring book,
  screenshot save, AI dialog flow, Parent Center, `/admin` full session, `/privacy`, service-worker
  registration and SW-controlled repeat visit) against the exact candidate enforcing policy on the
  production build produced zero violations. Reporting stays wired after the flip, so residual
  real-world breakage still surfaces in the function log.

## Decision

**The `Content-Security-Policy` header ships enforcing** (root `netlify.toml`), with the directive
set unchanged from the report-only era plus `report-uri /api/csp-report; report-to csp` and a
`Reporting-Endpoints: csp="/api/csp-report"` header.

**Violations post to a first-party receiver, `POST /api/csp-report`** — unauthenticated (browsers
post reports without credentials), per-IP rate-limited, size-capped before buffering, accepting both
the legacy `application/csp-report` and Reporting-API `application/reports+json` shapes, and logging
each violation as a structured `[csp-report]` line in the Netlify function log. Always answers 204
for accepted payloads so scanners get no oracle.

Non-obvious constraints:

* **Netlify custom headers attach only to CDN/static responses.** The prerendered pages (`/`,
  `/privacy`, `/admin/native`) get the header; function-served SSR responses (`/admin`) ship with no
  custom headers at all. This predates the flip (the report-only header had the same scope) and is
  documented beside the header block.
* **`'unsafe-inline'` stays, deliberately.** Script nonces via SvelteKit's `kit.csp` were assessed
  and split to a follow-up: the home page is prerendered, so SvelteKit would deliver its policy via
  `<meta>` (which cannot carry `frame-ancestors`/reporting directives), splitting the policy across
  two coordinated sources; the hand-authored `app.html` pre-paint stamp sits outside SvelteKit's
  nonce emission; and `inlineStyleThreshold: Infinity` keeps `style-src 'unsafe-inline'` regardless.
* The SW's NetworkFirst page cache means long-offline repeat visitors can surface violations days
  after a policy change — judge post-deploy reports by content, not recency.

## Consequences

* \+ Real protection: inline-injection and foreign-origin loads are now blocked, not just observed.
* \+ Violations from real traffic finally land somewhere visible (`[csp-report]` in the function
  log) — both for this policy and for any future tightening.
* − A future `netlify.toml` policy edit ships unvalidated (no CI parses the header); a syntax slip
  could silently weaken or over-tighten it. Consider a guard test if the policy starts changing.
* − The `/admin` SSR gap remains: closing it means emitting headers from SvelteKit for
  non-prerendered responses — tracked as follow-up work, and the sweep already verified `/admin`
  against this policy in anticipation.

Leans on **ADR-0007** (wildcard CORS model the receiver fits into) and **ADR-0014** (per-IP rate
limiting for unauthenticated endpoints).
