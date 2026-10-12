# Retained web host control

This first executable partition exercises the actual SvelteKit app through an isolated source and
dependency copy. The candidate-only wrapper imports the unchanged host configuration and retains its
argument-free Kit plugin, routes, layouts, hooks, API/admin, CSP, PWA and drawing ownership. There
is no React runtime, candidate UI, source overlay or alternate Kit route tree in this slice.

Invoke the root `migration:web-host:*` commands documented in
[the tool capability](../../../tools/migration/README.md). The build requires the actual reviewed
topology05 commit and lock, a frozen installed tree, and this slice's real source commit. An
explicit provisional trial is useful for iteration but remains unreviewed. The
[retained-control acceptance record](../../../docs/migration/evidence/retained-control/README.md)
separates historical local execution from the resumed source and CI acceptance gates.

The wrapper writes server/client module and static/dynamic edge receipts outside product output.
Both build copies use staged retained npm lifecycle owners with input checks between stages.
Complete copied source/dependency inventories are revalidated before later children/imports; Kit
support and generator outputs freeze after Vite. Browser transform caches start fresh per
invocation. Browser results and HTML reports use separate UUID invocation folders, recorded with
successful or failed child exits, so reruns preserve earlier evidence. The strict retained shipping
postbuild owners remain in force; mechanism controls use the existing instrumented classification
and never certify a release budget. The scoped TypeScript config checks maintained build/browser
files without widening `web/tsconfig.json`. The browser config serves only an existing owned
control, uses the original credential-safety owner and explicit port, and refuses foreign server
reuse. An explicit existing absolute browser registry preserves ordinary Playwright headless/channel
selection despite the owned XDG cache. The caller checks directory identity and records the borrowed
path; normal Playwright validation may write its `DEPENDENCIES_VALIDATED` marker. No browser
install/download/cleanup or executable override is added. Release ink is observed externally; the
mechanism case holds actual layout hydration and checks a real held request and absent debug
adoption after early ink, then adoption of the same early paper and visible ink. Preview inherits
the Playwright-owned server group. Copied build and browser children own detached groups; active
interruption handlers stop only those groups, escalate after a grace period and record interruption
as failure, even if the child exits successfully.

Before the first PR is accepted, record real child exits, both build passes, ordinary/wrapper
comparison, active-checkout isolation, screenshots, browser controls and applicable repository
checks. Complete emitted-byte comparison (recorded owned-copy path normalization only), wrapper
module receipts and source/startup checks must bind the tested source. Paired builds share one
recorded app-shell nonce through the actual nonce owner; ambient shipping pins fail loudly, and
readback requires both emitted shell URLs to equal the pin. No nonce URL normalization remains. Root
discovery and CI register the retained control over the accepted topology checkpoint. Deployed
headers, worker update/offline behavior, React SSR/hydration/recovery, startup accounting and
physical performance remain later gates. No architecture selection follows from a retained control.
