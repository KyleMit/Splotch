# ADR-0109: Dev-Gated Production Invoke Handles for E2E

**Status:** Active **Date:** 2026-08 **Amends:** [0010](0010-compile-time-build-constants.md),
[0080](0080-committed-brush-mode-seam-and-paced-strokes.md) **Amended by:**
[0123](0123-capture-mode-flag-for-store-screenshots.md)

## Context

The AI result modal was exercised by a dedicated AI timer dev page that called `startAiGeneration`
and `finishAiGeneration` directly with two binary fixtures. It was useful while the progress
animation was being designed, but after that loop ended it became a weaker test boundary than the
production flow: the Playwright cases never reached the real canvas export, WebP upload encoding,
`fetch`, `readAiImageResponse`, or `applyResponse`. The harness also required a server route in the
production server build, roughly 300 lines of Svelte, an index entry, a Settings link, a dev-server
warm-up probe, and special handling in the page-inventory generator.

ADR-0080 established a dev-gated `window` seam for observing the engine's committed brush mode; the
seam module stated that test seams should be read-only. That rule correctly rejects setters that
place the app in state no child can reach, but it was too broad: `__screenshotSaveSink` already
represented an instrumentation boundary, and an invoke handle for a production function does not
manufacture a new state transition. It asks production code to perform the same transition with
production arguments.

Alternatives considered:

* **Keep the timer harness.** Rejected because its manual state calls skip the client pipeline whose
  response branches are most likely to drift, while retaining a production server route that reads
  test artifacts.
* **Inject an `AiTransport` or select a fake implementation from a registry.** Rejected because HTTP
  is already the replaceable boundary and Playwright's route interception sits below it. A
  TypeScript fake would skip upload encoding, header parsing, response classification, and response
  application. A registry object would also keep the fake reachable in the startup chunk, contrary
  to the no-speculative-surface rule; unlike ADR-0047's server provider boundary, there is no second
  production client transport.
* **Add timing controls for the dial overrun and 27-second client timeout.** Rejected because those
  controls would change the timing ladder being tested. The overrun math remains unit-tested; its
  pulse class and the timeout presentation do not justify another production seam.

## Decision

`web/src/lib/boot/devHarnessSeam.ts` may publish an **invoke handle** when all of these conditions
hold:

* the handle points directly to a production function and accepts only its production arguments;
* it does not set internal state or select an implementation unavailable to users;
* the replaceable dependency remains below the function at an existing boundary such as HTTP; and
* the handle uses the existing compile-time dev-harness gate and teardown, so ordinary release
  bundles contain neither the assignment nor the property name.

The first handle is `window.__aiGenerate = generateAiImage`. It is declared as an optional type in
`web/src/app.d.ts`, installed beside the existing drawing-route seams, and removed on teardown.
`web/tests/ai-result.spec.ts` invokes it with `{ style: 'Magical' }` while intercepting
`/api/generate-image`. The successful mock returns the `web/tests/artifacts/` generated picture
whose orientation matches the viewport (`ai-output-fixtures.ts`); the drawing preview comes from the
real canvas export, so the old drawing fixture is gone. The page-inventory generator drives the same
handle and endpoint boundary.

Inspection seams remain read-only. The distinction is behavioral: observing production state is
allowed, invoking a production transition is allowed under the conditions above, and directly
mutating otherwise-unreachable state is not.

The handle follows the boot module's existing `dev || __DEV_HARNESS__ || PERF_MARKS` gate. It is
therefore available in local dev servers, Playwright dev-harness builds, and instrumented profiling
builds. `tools/check-release-seams.mjs` derives forbidden `window.__*` tokens from
`devHarnessSeam.ts`, so `__aiGenerate` automatically joins the post-build release scan without a
second token list. This import adds no startup module edge: `generateAiImage` is already statically
reachable from `ActionsPanel.svelte` on the same drawing-route path, while its save pipeline remains
dynamically imported. `web/tests/startup-bundle.spec.ts` empirically guards that boundary.

`web/tests/flows-ai.spec.ts` remains the complementary coverage for the AI button, style picker, and
generate entry surface. The invoke-handle specs deliberately begin below that UI and must not be
treated as a replacement for it.

## Consequences

* \+ The result-modal cases cover the production canvas export, upload encoding, fetch, response
  parsing, and state application while remaining deterministic and free of Gemini calls.
* \+ The dedicated timer route, its production server endpoint, one binary fixture, and every
  navigation/reference to the harness are removed.
* \+ Future invoke handles have a narrow rule that preserves the reason inspection seams were made
  read-only without banning production entry points.
* \+ Release retention is guarded automatically by the same source-derived scanner as every other
  drawing-route seam.
* − The tests can invoke generation without exercising the AI button or style picker, so the
  separate production-entry flow remains necessary.
* − Instrumented `PERF_MARKS` builds expose an invokable generation handle even when the dev-harness
  literal is false; those builds are controlled diagnostics and must not be distributed as release
  artifacts.
* − The dial's overrun pulse and the client-timeout message no longer have E2E coverage. The overrun
  calculation remains covered at the unit layer.
