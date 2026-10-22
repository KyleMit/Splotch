# ADR-0183: A Test API Deploy with Build-Time Implementations and Native Origin

**Status:** Active **Date:** 2026-10

## Context

Release-optimized native apps need to exercise AI generation, polling, reports and feedback over
HTTPS without paid model calls or production writes. Endpoint mocks would miss authorization,
validation, grants, rate limits and delivery behavior. A mock route on the production service would
add a second contract and make fake behavior reachable in a production deployment. A runtime mode
switch would package both implementations and leave external effects available in the test bundle.

The maintainer chose a separate Netlify branch deploy at `test.splotch.art`, sharing every API
handler with production and replacing only the model and outside effects. This extends the provider
boundary in ADR-0047 and the RN deployment in ADR-0182.

## Decision

`tools/api-mode/selection.mjs` reads `SPLOTCH_API_MODE` before the Netlify build. Unset means
`production`; the only other accepted value is `test`. Test mode with Netlify `CONTEXT=production`
fails before writing outputs. The `prebuild:site` lifecycle writes
`netlify/server/deployment.generated.ts` and `deploymentConfig.generated.ts`, whose committed copies
select production. Storage/configuration selection stays separate so purge functions do not import
the image model. Its static re-exports choose one provider, GitHub sink and storage/project-key
implementation set. Deployed server code never reads the mode from its environment. Runtime
credential reads remain runtime reads in the production implementation.

Production selects OpenAI and the real GitHub sink. Test selects deterministic canned PNG output and
documented fake keys, including refusal and failure cases, through the existing `AiImageProvider`
result types. The fake project key enables free and managed generations without an OpenAI secret.
The fake GitHub sink records sanitized issue inputs in the test Blobs namespace and has no GitHub
HTTP implementation. HTTP handlers and their error mapping stay shared.

All live server Blobs access goes through `netlify/server/blobs.ts`. The selected scope leaves
production names unchanged and prefixes every test store with `test-`, including token lists, free
grants, usage, jobs, attempts, image reports and the fake GitHub sink. Scheduled purge functions use
the same storage owners, so they cannot cross the deploy boundary. Netlify site-wide stores are
shared between deploys; a separate hostname alone does not isolate them.

Only `[context.test.environment]` enables test mode. Test builds emit a universal noindex edge
function into `.netlify/api-mode-edge`; production rebuilds empty that directory. The edge function
decorates the downstream response with `X-Robots-Tag: noindex`, preserving its status, body and
other headers. This covers pages, functions, redirects and errors; static custom header rules alone
do not cover function responses. The maintainer owns branch-deploy enablement, domain mapping and
context-specific secrets.

Native bundles read `EXPO_PUBLIC_SPLOTCH_API_ORIGIN` through `src/apiOrigin.ts`. Expo's production
Babel transform inlines it; the default is `https://splotch.art`. The build rejects values that are
not HTTPS origins, including paths, credentials, queries and fragments. Official store build scripts
additionally require the production origin. Test-pointed Release builds retain the `.dev` identity;
they do not become store binaries. AI transport, invite acceptance, feedback and coloring pack
downloads share this origin. Web resolves `apiOrigin.web.ts` and continues making relative API
requests. Public policy/contact links and canonical marketing URLs remain production links. There is
no runtime switch, launch argument or deep link that changes a native origin.

Bundle guards cover every function entry point and compile the native network-origin owners through
Expo's released inlining transform. They reject opposite-mode bundles as negative controls. The
unchanged historical wire corpus remains the production contract. An additional test-mode smoke runs
the real function host, background worker, polling and reports against the local Blobs emulator with
outside network requests refused. Its emulator adapter supplies missing read ETags from actual
writes so free-grant compare-and-swap logic runs without weakening the server's contract.

The native release builder also inspects the complete embedded JavaScript/Hermes bundle in the
produced APK, AAB, app archive, IPA or simulator app. Store configuration rejects the test hostname
and any non-production first-party origin; the configured origin must be present. This check runs on
actual compiled artifacts in native CI, in addition to the focused Expo inlining guards.

## Consequences

* \+ Test apps reach the real HTTPS endpoint contracts while the test function bundle contains no
  OpenAI client or real GitHub sink; production contains no fake provider.
* \+ Test storage and scheduled cleanup are isolated despite sharing the Netlify site.
* \+ A binary's server origin is fixed when built, so another app cannot redirect a saved parent
  key.
* − Changing mode or native origin requires a rebuild. A generated test selection must never be
  committed; the default-selection guard enforces that boundary.
* − Fake results exercise app behavior, not model quality or safety accuracy. The canned output is
  deliberately recognizable and cannot replace provider integration testing.
* − The maintainer must configure the test branch/domain and separate signing/grant secrets before
  the hosted test flow can be verified; this PR does not configure Netlify's dashboard.
