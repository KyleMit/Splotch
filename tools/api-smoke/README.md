# API smoke tooling

This capability exercises Splotch's HTTP API as a running system. One entry point boots a local
throwaway Vite server and checks the documented request/response contract without live model or
storage credentials. The other checks a deployed Netlify function to prove its Blobs context is
persistent and writable.

## Entry points

| Entry point                | Public command             | Purpose                                           |
| -------------------------- | -------------------------- | ------------------------------------------------- |
| `run-local-contract.mjs`   | `npm run test:api:smoke`   | Run the local `/api/*` contract smoke test        |
| `check-deployed-blobs.mjs` | `npm run test:blobs:smoke` | Validate Blobs persistence on a deployed function |

`lib/admin-client.mjs` owns the shared `/api/admin` login exchange and token CRUD request plumbing.
It returns raw responses and parsed JSON together; assertions and lifecycle policy remain in the
entry points.

## Local contract inputs and outputs

`run-local-contract.mjs` needs no external credentials. It starts a Vite dev server on `SMOKE_PORT`
(default `5199`) with explicit safe test values, exercises CORS, authentication, validation, rate
limits, reporting, and public-oracle behavior, then tears the server down. It prints pass/fail
diagnostics and writes no artifact. The process exits nonzero on any failed check or startup error.

Keep its server environment in agreement with every private environment variable read by the web
app. `tools/tests/e2e-server-env.test.mjs` enforces that agreement so a developer's `web/.env`
cannot make the smoke test reach a real service accidentally.

## Deployed Blobs inputs and outputs

`check-deployed-blobs.mjs` requires an HTTPS deployment URL and its matching admin secret:

```sh
BLOBS_SMOKE_URL=https://deploy-preview-123--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
```

The URL may instead be the first positional argument. The check logs into `/api/admin`, asserts that
the token snapshot reports `persistent: true`, adds a unique probe token, reads it back, and removes
it. Cleanup is attempted again after a failure and is idempotent, but if a run is interrupted
inspect the admin console for a `blobs-smoke-*` token. Missing configuration exits with status 2; a
failed contract exits nonzero. This reversible probe is a bounded exception to ADR-0111's otherwise
read-only `check` contract because persistence cannot be validated without a write and read-back.

## Maintenance

The API contract is documented in `docs/API.md` and implemented under `web/src/routes/api/`. When an
endpoint or response shape changes, update the reference, extend the local smoke assertions, and
keep the owned admin client request-only. Changes to deployed persistence semantics must update the
Blobs workflow and ADR-0025 expectations together.

The [Blobs Smoke workflow](../../.github/workflows/blobs-smoke.yml) runs
`node tools/api-smoke/check-deployed-blobs.mjs` directly with `install: 'false'` and no install, so
that entry point and everything it loads — `lib/admin-client.mjs`, `tools/lib/proc.mjs`, and
`tools/lib/smoke.mjs` — must stay dependency-free. Adding an npm dependency to any of those modules
breaks the deploy gate at runtime rather than in CI's unit job.

Automatic workflow runs target `https://splotch.art`; the repository-wide `deployment_status` event
belongs to the static GitHub Pages scrapbook and is only a cadence signal. Manual dispatch preserves
its supplied URL so an intended Netlify preview can be checked. Keep target selection in the
workflow rather than teaching this deploy-agnostic CLI about repository providers.

Run focused verification with:

```sh
npm run test:tools -- tools/tests/e2e-server-env.test.mjs tools/tests/tool-specifier-resolution.test.mjs
npm run test:api:smoke
```

The deployed Blobs check mutates a real shared store briefly and requires deployment credentials, so
run it only against an intended preview or production target.
