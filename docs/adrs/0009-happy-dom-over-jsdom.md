# ADR-0009: happy-dom Over jsdom for Vitest Unit Tests

**Status:** Active\
**Date:** 2025

## Context

Vitest unit tests that exercise the storage layer and Svelte `$state` modules need a browser-like
environment (DOM APIs, `localStorage`). The two mainstream options are `jsdom` and `happy-dom`.

Under **Node 22** with Vitest's forks pool, `jsdom` fails at worker startup:

```
ERR_REQUIRE_ESM: require() of ES Module is not supported
```

The failure originates from `jsdom`'s transitive dependency chain: `@asamuzakjp/css-color` →
`@csstools/css-calc` is an ESM-only package that gets `require()`'d in a CommonJS context. This is
an upstream interop bug, not something fixable in the project.

`happy-dom` has no equivalent ESM interop issue and supplies the `localStorage` and DOM APIs the
storage/state tests need.

## Decision

Set `environment: 'happy-dom'` in `vitest.config.ts`. Do not switch back to `jsdom` unless the
upstream `ERR_REQUIRE_ESM` bug in its dependency chain is resolved.

`vitest-setup.ts` additionally stubs `$app/environment` to return `browser: true` so that storage
and state modules always execute the browser code path (not the SSR no-op path) during tests.

## Consequences

* **+** Tests run reliably under Node 22 without ESM interop errors.
* **+** `localStorage` and basic DOM APIs are available for storage layer tests.
* **-** `happy-dom` is not a 100% faithful browser simulation; some DOM APIs may be missing or
  behave differently from Chrome/Firefox. Tests that require full browser fidelity belong in the
  Playwright E2E suite.
* **-** The root cause is an upstream bug in `jsdom`'s deps; if that's fixed and `jsdom` gains
  needed APIs, this decision should be revisited.
