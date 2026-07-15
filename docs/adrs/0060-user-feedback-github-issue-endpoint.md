# ADR-0060: In-App Feedback via a Server-Proxied GitHub Issue Endpoint

**Status:** Active **Date:** 2026-07

## Context

The Parent Center's only "report a problem" path was a link to
`github.com/KyleMit/Splotch/issues/new/choose`. That excludes almost everyone who would actually use
it: a parent of a toddler rarely has a GitHub account, doesn't know the repo's issue conventions,
and won't leave the app to file a formatted issue. We wanted an in-app form — pick bug or feature,
type a sentence, optionally attach device info, submit — that lands as a real, labelled issue.

The blocker is auth: creating an issue needs a GitHub credential, and a static/native client can't
hold one. GitHub write access must live server-side. Splotch already has a web-only server tier
(`web/src/lib/server/*`) reached from native via `apiUrl()`, and a strong "no tracking, no
analytics, no data collection" privacy stance (`/privacy`, `hooks.client.ts`) that any new data path
has to respect.

Decisions to make: how the server authenticates to GitHub, where the integration lives, how the
endpoint is protected (it's an unauthenticated public write), and what device info — if any — is
attachable without breaking the privacy promise.

## Decision

A new `POST /api/report` endpoint (`web/src/routes/api/report/+server.ts`) receives
`{ kind, message, device?, hp? }` and opens a GitHub issue, returning `{ ok, url }`.

* **Auth: a fine-grained PAT**, `GITHUB_ISSUE_TOKEN`, scoped to *Issues: Read and write* on the
  target repo only, read via `$env/dynamic/private` and set in Netlify — never shipped to the
  client. A fine-grained PAT was chosen over a GitHub App: for a single personal repo it is far less
  setup (no app registration, install, or private-key management) at the cost of periodic rotation
  (max 1-year expiry). `GITHUB_ISSUE_REPO` overrides the default `KyleMit/Splotch`.
* **A server seam**, `web/src/lib/server/github.ts`, owns the REST call and the token, mirroring the
  AI provider seam (ADR-0047) — route code never touches either. `isReportingConfigured()` lets the
  endpoint answer a graceful `503` when no token is set (local dev, the smoke test) instead of
  erroring.
* **Abuse controls for an unauthenticated write:** per-IP rate limiting (ADR-0014) with a tighter
  budget than the read-only oracles (5/min vs 10), a hidden honeypot field (`hp`) that is quietly
  accepted with no issue created, a required non-empty `message` capped at 4000 chars, and `kind`
  restricted to `bug | feature`. Issues are labelled `user-report` + `type:bug`/`type:feature`
  (added to `.github/labels.yml`) so submissions are triageable and filterable.
* **Opt-in, non-identifying device info.** For bugs only, the parent may tick a box (off by default)
  to attach a small snapshot, and expand a chevron to see exactly what will be sent first. The shape
  lives in a shared, dependency-free `web/src/lib/deviceReport.ts` (one ordered field/label map used
  both to preview client-side and to render the issue Markdown, so they never drift) and is
  re-sanitized server-side (known keys only, single-line, length-capped). The client collector
  (`web/src/lib/deviceInfo.ts`) forks by platform: on native it reads `@capacitor/device` (added as
  a dependency; import gated behind the literal `__IS_CAPACITOR__` so Rollup drops it from the web
  bundle, per ADR-0013) for a clean OS/model reading; on web it reads only standard
  `navigator`/`window`/`screen` fields plus the raw user-agent. It deliberately excludes anything
  identifying — no `Device.getId()`, no advertising id, no added IP.

The form is a section in the Parent Center's About tab (`ReportForm.svelte`), not a new tab, to keep
the tab bar uncluttered. The privacy page gained a "Sending feedback" section describing the opt-in
path honestly.

Alternatives considered:

* **Keep the external GitHub link** — the status quo; rejected because it's exactly the barrier
  we're removing.
* **A GitHub App instead of a PAT** — more robust and longer-lived, but disproportionate setup for
  one personal repo; revisit if the repo set or ownership grows.
* **A dedicated telemetry/error-reporting SDK** — directly violates the "no analytics, no
  third-party SDKs" stance; the whole point is a user-initiated, opt-in, single-destination path,
  not background collection.
* **A new "Report" tab** — more discoverable, but a fifth tab was judged more noise than the About
  section is worth.

## Consequences

* \+ Anyone can file a real, labelled, well-formed issue without a GitHub account or leaving the
  app; the returned URL lets them follow it if they want.
* \+ GitHub credentials stay server-side behind a seam; the same endpoint serves web and native via
  `apiUrl()`, and the CORS/rate-limit model (ADR-0007/0014) already covers it.
* \+ Device info is opt-in, previewed before sending, non-identifying, and single-destination —
  consistent with the privacy stance, which the `/privacy` page now documents.
* − A public unauthenticated write is a spam vector; mitigated (rate limit + honeypot + validation),
  not eliminated. If abuse appears, tighten the budget or add a stronger challenge.
* − The PAT expires and must be rotated (≤ 1 year); a lapse degrades to a graceful `503`, not a
  crash. A GitHub App is the escape hatch if rotation becomes a burden.
* − `@capacitor/device` is a new native dependency; its richer fields only reach devices after a new
  store build, and the code degrades gracefully (try/catch → UA fallback) on older installs.
