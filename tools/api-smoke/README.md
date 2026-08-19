# API smoke tooling

This capability exercises Splotch's HTTP API as a running system. One entry point boots a local
throwaway Vite server and checks the documented request/response contract without live model or
storage credentials. The hosted check verifies the built site, safe API failures, and durable
storage together. A narrower entry point remains available when only Blobs persistence is relevant.

## Entry points

| Entry point                   | Public command              | Purpose                                              |
| ----------------------------- | --------------------------- | ---------------------------------------------------- |
| `run-local-contract.mjs`      | `npm run test:api:smoke`    | Run the local `/api/*` contract smoke test           |
| `check-deployed-contract.mjs` | `npm run test:deploy:smoke` | Validate the complete hosted deploy contract         |
| `check-deployed-blobs.mjs`    | `npm run test:blobs:smoke`  | Validate only Blobs persistence on a real deployment |

`lib/admin-client.mjs` owns the shared `/api/admin` request plumbing.
`lib/deployed-admin-contract.mjs` owns the persistent token round-trip used by both deployed entry
points. Assertions remain in the contract layers rather than in the request client.

## Local contract inputs and outputs

`run-local-contract.mjs` needs no external credentials. It starts a Vite dev server on `SMOKE_PORT`
(default `5199`) with explicit safe test values, exercises CORS, authentication, validation, rate
limits, reporting, and public-oracle behavior, then tears the server down. It prints pass/fail
diagnostics and writes no artifact. The process exits nonzero on any failed check or startup error.

Keep its server environment in agreement with every private environment variable read by the web
app. `tools/tests/e2e-server-env.test.mjs` enforces that agreement so a developer's `web/.env`
cannot make the smoke test reach a real service accidentally.

## Hosted deploy inputs and outputs

`check-deployed-contract.mjs` requires an HTTPS deployment URL and its matching admin secret:

```sh
DEPLOY_SMOKE_URL=https://deploy-preview-123--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:deploy:smoke
```

The URL may instead be passed as `--url=https://…`.

It checks `/` and `/privacy`, their full security-header set, an immutable app asset, `version.json`
and its no-cache policy, both Capacitor-origin preflights, representative canonical API failures
that stop before any model call, and the persistent admin token round-trip. The deployed version
must exactly match the ADR-0030 version derived from the checker's current git commit. Run a manual
preview check from the same branch/ref that Netlify built; pointing a different ref at that preview
is intentionally reported as stale.

The dependency-free workflow checks production daily. Manual dispatch accepts an optional URL so it
can check either production by default or an intended Netlify preview. GitHub's repository-wide
`deployment_status` records belong to the static scrapbook on GitHub Pages, so they are not a valid
Netlify trigger or target source.

Default-production runs set `DEPLOY_SMOKE_REQUIRE_CURRENT_VERSION=false`: they still require a valid
version shape and the no-cache policy, but do not compare it to repository `HEAD`. ADR-0070
deliberately skips Netlify builds for docs/tooling-only commits, so `HEAD` can correctly be newer
than production. Direct CLI runs and workflow runs with an explicit URL retain the exact comparison
because they pair a specific ref with a specific deploy.

## Deployed Blobs-only inputs and outputs

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

The [Hosted Deploy Smoke workflow](../../.github/workflows/blobs-smoke.yml) runs
`check-deployed-contract.mjs` with `install: 'false'`. That entry point and everything it loads —
including `web/buildVersion.ts`, `web/src/lib/server/securityHeaders.ts`, the deployed admin
contract, and the shared tool modules — must stay dependency-free. Adding an npm dependency to any
of them breaks the deploy gate at runtime rather than in CI's unit job.

All workflow runs share a single concurrency group because previews and production use the same
site-wide store. Keep target selection in the workflow rather than teaching the deploy-agnostic CLI
about repository providers.

Run focused verification with:

```sh
npm run test:tools -- tools/tests/e2e-server-env.test.mjs tools/tests/tool-specifier-resolution.test.mjs
npm run test:api:smoke
```

The deployed Blobs check mutates a real shared store briefly and requires deployment credentials, so
run it only against an intended preview or production target. Its `finally` cleanup cannot run when
the process or runner is terminated. In that case, remove the unguessable but live `blobs-smoke-*`
credential manually through the admin console. Do not automate a prefix-wide sweep: this CLI can run
outside the workflow's concurrency group and could delete another smoke's active probe.
