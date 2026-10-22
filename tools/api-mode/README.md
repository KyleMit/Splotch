# API deploy mode

The server implementation selection for the production and test Netlify deploys (ADR-0183). API
handlers are never replaced. This capability owns `selection.mjs`, the static selection output, the
function-bundle guard and the test-only edge response decorator from
`tools/lib/noindex-response.ts`.

`npm run build:site` runs `prebuild:site` first. It reads `SPLOTCH_API_MODE` (`production` by
default, or `test`) and Netlify's `CONTEXT`; test mode in the production context fails immediately.
The step writes `netlify/server/deployment.generated.ts` and
`netlify/server/deploymentConfig.generated.ts`. Commit only their production selections.
Configuration is separate so storage/purge functions do not import a model. It also recreates
`.netlify/api-mode-edge`: empty for production, with the universal noindex edge function for test.
`netlify.toml` selects this directory outside the published web directory.

The test selector imports only the fake model, recording GitHub sink and test storage/project key.
The production selector imports only the production implementations. No runtime environment flag
selects server behavior. `netlify/server/blobs.ts` prefixes all test store names, including stores
used by purges. The recording sink writes issue titles, bodies, labels and timestamps to
`test-github-issues`; it files nothing. Test image evidence stays in `test-ai-image-reports`.

Netlify runs schedules only for published deploys. Fake provider/key-check and recording-sink
activity therefore triggers test-data cleanup, coalesced to once per hour per warm instance; a
failed sweep retries on the next activity. The published deploy's hourly `purge-test-data` adds a
backstop after this revision reaches production. Both paths use the same retention owners with an
explicit test namespace and cannot touch unprefixed stores. Recorded feedback uses the same 30-day
window as image reports. Before cutover, idle branch data waits for activity or a manual dashboard
invocation. When retiring the test deploy, invoke `purge-test-data` after its retention windows
expire. The local-emulator regression test invokes both schedules and real test-provider traffic,
deletes expired fixtures and asserts every production sentinel survives.

## Fake keys

Enter these in the existing OpenAI-key UI or send them in the existing `X-Api-Key` header. No new
prompt field, request parameter, header or endpoint is added. Other keys are rejected. Free and
managed generation automatically use the success key without an OpenAI secret.

| Key                           | Key verification                              | Generation                                                    |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `sk-test-success`             | Accept                                        | Deterministic PNG                                             |
| `sk-test-invalid-key`         | Reject through the shared HTTP 200 oracle     | Provider error through the shared HTTP 502 path               |
| `sk-test-rate-limited`        | Accept                                        | Provider 429 error through the existing HTTP 502 adapter path |
| `sk-test-error`               | Accept                                        | Model error, HTTP 502                                         |
| `sk-test-timeout`             | Accept                                        | Model timeout, HTTP 502                                       |
| `sk-test-refusal`             | Accept                                        | Content refusal, HTTP 422 with the real report-token flow     |
| `sk-test-verify-rate-limited` | Unreachable, HTTP 503 `KEY_CHECK_UNAVAILABLE` | Invalid generation key                                        |
| `sk-test-verify-timeout`      | Unreachable, HTTP 503 `KEY_CHECK_UNAVAILABLE` | Invalid generation key                                        |

Generation waits `FAKE_IMAGE_DELAY_MS`; key checks have their own named delay. The canned PNG has a
flat magenta backdrop so the real Sticker punch-out path also works. A provider rate limit is not
the API's own rate limit: the shared API buckets still produce their normal HTTP 429 and
`Retry-After` responses.

## Verification and recovery

```sh
npm run test:tools -- tools/api-mode/tests tools/api-smoke/tests/local-blob-fetch.test.mjs tools/tests/e2e-server-env.test.mjs
npm run test:api:smoke
SPLOTCH_API_MODE=test SMOKE_PORT=5300 npm run test:api:smoke
```

Choose an unused `SMOKE_PORT` before either host run. Test mode uses `@netlify/blobs/server` in a
temporary directory and runs the production handler/worker paths. It checks free and managed
generation, pending/result polling, fake key/error/refusal outcomes, image reports, feedback and
exclusively test-prefixed store names. Its fetch adapter refuses outside services. The SDK's local
emulator omits read ETags, so the harness preserves its real write ETags for subsequent reads;
production storage behavior is unchanged. Both the host and emulator close in `finally`.

The bundle tests build all live function entries, examine emitted code and module provenance, and
reject deliberately swapped production/test bundles. Native-origin tests bundle the actual AI,
invite, feedback and pack-origin owners through Expo's production transform; a test-origin bundle
must fail the store-origin guard. The default selector, production-context refusal and scoped Blobs
boundary have separate guards.

A failed build is not a deploy. Correct the invalid mode/context rather than falling back. After a
local test build, restore the default selection with `node tools/api-mode/selection.mjs` with
`SPLOTCH_API_MODE` unset, then check the diff before committing. Do not commit ignored edge output.
Native build commands and the maintainer's deploy checklist are in `DEVELOPMENT.md`.

The native release builder also inspects the complete embedded JavaScript/Hermes bundle in the
produced APK, AAB, app archive, IPA or simulator app. Store configuration rejects the test hostname
and any non-production first-party origin; the configured origin must be present. Production-pointed
development builds enforce the same exclusion, and Gradle tracks the origin as a bundle input. This
check runs on actual compiled artifacts in native CI, in addition to the focused Expo inlining
guards.
