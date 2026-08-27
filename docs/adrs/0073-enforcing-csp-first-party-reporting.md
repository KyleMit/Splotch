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
  screenshot save, AI dialog flow, Settings, `/admin` full session, `/privacy`, service-worker
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
  `/privacy`) get the header; function-served SSR responses (`/admin`) ship with no custom headers
  at all. This predates the flip (the report-only header had the same scope) and is documented
  beside the header block. (Closed since — see the Update below.)
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

## Update (2026-07): SSR responses now carry the headers

Both `−` consequences above are addressed (issue #470). `web/src/lib/server/securityHeaders.ts` is
the single source for the header set, and `web/src/hooks.server.ts` stamps it onto every non-`/api`
SSR response, so `/admin` now ships the same CSP and security headers as the static pages — the
credentialed console is no longer the least-protected page.
`web/src/lib/server/securityHeaders.test.ts` parses the `netlify.toml` `for = "/*"` block and
asserts the two copies match, the drift guard this ADR flagged; `web/tests/admin.spec.ts` asserts
the live SSR response carries the set. The `'unsafe-inline'` follow-up (script nonces) remains open
and separate.

## Update (2026-08): the E2E suite runs with no CSP, so `connect-src` needed widening

`connect-src 'self'` blocked the picture report in production: it reads the drawing and the AI
result back out of their object URLs, and `'self'` does not cover a `blob:` URL — CSP matches it by
scheme, not by the origin baked into it. `connect-src 'self' blob:` in both copies fixes it. That is
a widening of exactly one scheme whose URLs the page can only have minted itself, so it opens no
outbound destination; `img-src` already carried `blob:` for the same previews.

The gap that let it ship is the more durable finding: **no spec exercised the shipped policy.**
Playwright serves the production build through `vite preview`, which returns the prerendered pages
as static files, and the header they get in production comes from the `netlify.toml` block that only
Netlify's CDN reads — so the whole suite runs unpoliced, and a client behaviour the CSP forbids
passes locally and in CI. `enforceProductionCsp` (`web/tests/helpers.ts`) stamps `SECURITY_HEADERS`'
policy onto document responses for a spec that needs the real thing; `ai-result.spec.ts`'s report
flow uses it and fails without the `blob:` grant. Applying it suite-wide would turn every
CSP-violating behaviour into a local failure and is worth considering, but it is a broad change to
every spec's environment and was left out of the fix.

## Update (2026-08): native static builds receive the enforcing subset as a meta policy

The Android and iOS bundles have no server to deliver the web response header, so issue #617 adds a
Capacitor-only `kit.csp` configuration in `web/svelte.config.js`. `mode: 'auto'` emits one CSP meta
tag into every static native document; the web build leaves `kit.csp` unset and remains header-only.

`web/securityPolicy.ts` is the build-side source for both targets' directive map and imports the
hosted API origin from `web/src/lib/siteUrl.ts`. The web header serializes the canonical map
unchanged. Native derives from the same map but adds `https://splotch.art` to `connect-src`, because
the Capacitor document origin is local while every `/api/*` request goes to the hosted service.
Vite's `__NATIVE_API_BASE__` comes from that same origin, so changing one cannot silently strand the
other.

Meta delivery cannot enforce `frame-ancestors` or `report-uri`; SvelteKit omits both from the
emitted native policy. Native also omits `report-to`: a static WebView cannot receive the
`Reporting-Endpoints` response header that defines its reporting group, so the native policy
enforces with no violation-reporting channel. Web reporting is unchanged. `postbuild:cap` verifies
the actual static export has exactly one expected policy per HTML document, including those
omissions, while the web production E2E suite guards against gaining a meta policy. This constrains
WebView resource and Fetch/WebSocket destinations; it does not change Android's broad `INTERNET`
permission or restrict sockets opened by native plugin code.

## Update (2026-08): script policy uses prerender hashes and SSR nonces

Issue #471 removes `'unsafe-inline'` from `script-src`. SvelteKit now owns the complete resource
policy for both web delivery modes through `kit.csp.mode = 'auto'`: prerendered documents receive a
hash-bearing CSP meta tag, while dynamically rendered documents receive a nonce-bearing CSP response
header. `style-src 'unsafe-inline'` is unchanged because the inlined component styles and Svelte
transitions still require it; this tightening is deliberately script-only.

The Netlify/SSR security-header policy is now the complementary
`frame-ancestors 'none'; report-uri /api/csp-report` subset. It deliberately carries neither
`default-src` nor `script-src`: browsers enforce multiple policies by intersection, so retaining
either directive in that second policy would block the inline boot code that SvelteKit's hashes or
nonces authorize. On SSR responses, `hooks.server.ts` preserves SvelteKit's existing full CSP
instead of replacing it with the platform subset. On prerendered responses, Netlify supplies the
subset that meta delivery cannot express, while SvelteKit's meta policy retains `report-to csp` and
the response's `Reporting-Endpoints` header defines that group.

Reporting coverage is not equivalent across the two delivery modes. Header-delivered SSR CSP keeps
both reporting mechanisms. On prerendered pages, legacy `report-uri` covers only violations of the
platform subset because browsers forbid it in a meta policy. The meta resource policy can generate
`report-to` entries in Chromium and WebKit — verified against the deployed policy through each
engine's `ReportingObserver` — but Reporting API network delivery is explicitly best-effort and the
same probe did not reach the Netlify receiver. Firefox versions without Reporting API delivery, and
users or privacy tools that disable it, have no fallback for meta resource-policy violations. This
loss is accepted to preserve prerendering and SvelteKit's generated script hashes; enforcement is
unchanged. Generating per-route Netlify policies from build output would restore a header reporting
channel but add a second CSP generator, while disabling prerendering would change the site's
delivery and performance model. Either remains a reversible follow-up if complete reporting becomes
more important than those costs.

The hand-authored pre-paint stamp in `app.html` cannot use `%sveltekit.nonce%`, because SvelteKit
forbids that placeholder anywhere in a prerendered template. Its exact body is authorized by
`APP_TEMPLATE_SCRIPT_HASH`, and `securityPolicy.test.ts` recomputes the SHA-256 from `app.html` so
any edit must explicitly update the policy. `/beta`'s generated pre-paint platform stamp has the
same guarded hash treatment. Externalizing either stamp was rejected because a new parser-blocking
file read would move first-paint state behind an avoidable request; generating route-specific
Netlify headers was rejected because SvelteKit already owns the correct per-page hash set and would
create a second build-output parser to keep aligned.

As a consequence, production Playwright builds carry the resource policy themselves instead of
running almost entirely without CSP. The focused `enforceProductionCsp` helper only adds the Netlify
half locally, reproducing the deployed two-policy composition.

## Update (2026-08): defer a strict style policy until the threat model changes

Issue #1436 confirms that `style-src 'unsafe-inline'` remains a deliberate exception. The current
app has no untrusted-content surface that renders caller- or provider-authored HTML or CSS. Its
production `{@html}` sinks are first-party inputs: `Icon.svelte` renders SVGs from the build-time
icon map, and the `/beta` route emits a module constant whose script hash is guarded by
`securityPolicy.test.ts`. User and provider content reaches the UI as text or image data, not
markup. Meanwhile the stricter `script-src` decision above blocks unauthorized inline script and
foreign script origins. Removing the style exception would therefore add defense in depth against a
future style-injection path, not close an identified path in the present product.

The current rendering model also makes removal costly:

* `inlineStyleThreshold: Infinity` in `web/svelte.config.js` deliberately keeps component CSS in the
  document so first paint does not briefly show square controls before their border-radius loads.
* Production components use dynamic `style` attributes for layout, color, and progress values.
* Svelte transitions in components such as `InstallBanner.svelte` and the Settings sections write
  transient element styles while animations run.

The alternatives considered were:

* **Externalize component CSS.** Lowering the inline threshold could remove the bulk inline style
  blocks, but adds a first-paint stylesheet request and reintroduces the FOUC the threshold was
  chosen to prevent. It still does not solve dynamic style attributes or transitions.
* **Nonce inline style blocks.** A nonce can authorize `<style>` elements, but it does not authorize
  element `style` attributes, so this leaves both dynamic style directives and Svelte transitions
  blocked.
* **Use `'unsafe-hashes'`.** Attribute hashes authorize exact serialized values. Runtime geometry,
  colors, progress, and transition frames do not form a stable finite inventory, and ordinary UI
  edits would create policy-hash churn. This is brittle without eliminating all dynamic values.
* **Rewrite styling around classes and stylesheet-owned custom properties.** Replacing Svelte
  transitions and dynamic attributes with class-driven CSS animations and predeclared stylesheet
  values could support a strict policy, but it is a cross-cutting UI rewrite. Merely moving values
  into custom properties on an element would still use a blocked style attribute.

The decision is to keep `style-src 'unsafe-inline'` and not pursue that rewrite under the current
threat model. Revisit this decision when any one of these conditions becomes true:

1. A production feature renders user-, server-, or provider-authored HTML or CSS, or lets such data
   influence raw DOM style values.
2. `script-src` is loosened to admit inline script, evaluation, or a broader script origin.
3. Svelte or the component architecture stops requiring runtime style attributes and transitions,
   and external CSS can preserve the first-paint contract without an extra blocking request.
4. A concrete style-injection finding or CSP report demonstrates an exploitable path under the
   current content model.

Consequences:

* \+ The strict script policy and existing rendering behavior remain intact without a speculative,
  cross-cutting UI rewrite.
* \+ The cost of a future strict style policy is recorded against the exact implementation
  constraints that create it, with objective triggers for reconsideration.
* − A future style-injection primitive would retain the capabilities granted by `'unsafe-inline'`
  until one of the revisit triggers is acted on.
* − The policy cannot claim strict CSP as a whole: script execution is strict, but inline CSS
  remains allowed by design.
