# RN web E2E

Playwright specs against the React Native web export: the `npm run build:site` output, served with
Netlify's headers, redirects and real API function. This is the browser suite for the app
(ADR-0182).

## Running it

| Command                      | What it runs                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `npm run test:e2e`           | Every spec in Chromium, and the smoke specs in each other engine that's installed |
| `npm run test:firefox:smoke` | The smoke specs in Firefox                                                        |
| `npm run test:webkit:smoke`  | The smoke specs in WebKit                                                         |

Trailing arguments pass through to Playwright:
`npm run test:e2e -- smoke.spec.ts --project chromium`.

Each run builds the export first (`npm run build:site`, about a minute). Set
`SPLOTCH_E2E_PREBUILT=1` to serve the export already on disk, but only when you just built it from
this checkout: a stale export passes against code that no longer exists. In a shared checkout pick a
free port with `npm --silent run show:free-port` and pass it as `SPLOTCH_E2E_PORT` (the default is
4180).

```sh
SPLOTCH_E2E_PORT=5330 SPLOTCH_E2E_PREBUILT=1 npm run test:e2e -- --workers=1
```

## The server

`server/serve.ts` serves the directory `netlify.toml` publishes, with that file's `[[headers]]` and
`[[redirects]]` rules, `404.html` with status 404 for any other path, and every `/api` path from the
real function (`netlify/functions/`) on the same origin. The function runs as deployed: no Netlify
Blobs, and the CSRF guard on. `server/serverEnv.ts` declares its whole environment: a test admin
key, one managed access code, a model key that cannot authenticate, and reporting left unconfigured.
Nothing comes from your shell or a dotenv file.

## Writing a spec

* **Import `test` and `expect` from `fixtures.ts`**, never from `@playwright/test`.
* **Put the spec in `specs/`**, named `<subject>.spec.ts`.
* **Start on the drawing screen with the `drawingScreen` fixture.** It opens `/` and waits until the
  engine and the controls answer input. Its helpers are `pickColor`, `drawStroke`, `inkedPixels` and
  `undo`. A stroke has landed when `inkedPixels(stroke)` exceeds `stroke.lengthPx`. Undo has taken
  it back when the count returns to 0.
* **Open any other document with `openDocument(page, path)`** from `support/app.ts`. It returns the
  host's response, so a spec can assert the status.
* **Reach `/api` with Playwright's own `request` fixture.** Its base URL is the suite's origin. Use
  the credentials `server/serverEnv.ts` exports rather than spelling them.
* **Tag a spec `SMOKE_TAG` (`tags.ts`) only if it proves the app boots or draws in every engine.**
  Chromium runs every spec; Firefox and WebKit run only the tagged ones. Import the tag, never write
  it as a string: `tools/tests/e2e-engine-tags.test.mjs` fails on a literal. Keep a smoke spec free
  of CDP sessions and other Chromium-only seams.
* **Drive the export as a person does.** The export has no dev harness, so a spec can only press,
  type, draw, navigate and read. Pin the copy as it renders.

## Helpers

`fixtures.ts`, `support/app.ts` and `support/drawing.ts` are the suite's common helpers. A lane
porting specs from `e2e/specs/` does not edit them, so lanes working at once never edit the same
file:

* A helper that only one spec uses stays in that spec.
* A helper that several of one porting lane's specs share goes in that lane's own file,
  `support/group-<letter>.ts`, lettered `a`, `b` or `c` like the lane's disposition table.
* A helper every lane needs is a change to the common helpers, in its own pull request.

## In CI

The Native web build job builds the export once and uploads it. The RN web E2E job's shards and the
Firefox and WebKit smoke jobs download it and run with `SPLOTCH_E2E_PREBUILT=1`. The shard count is
the `shard` list in the `rn-web-e2e` job of `.github/workflows/test.yml`. Each job uploads
`playwright-report/`, which also holds the flaky reporter's `flaky.json`
(`e2e/playwright-flaky-reporter.ts`, shared with the SvelteKit suite).

## Real-handler integration lane

Run `SPLOTCH_E2E_PORT=5300 npm run test:e2e:api -- --workers=1` on an unused port. The dedicated
config selects `specs/api-integration.spec.ts`; the focused suite excludes it. Each scenario uses
fresh browser storage, a new local Blobs emulator and the shared function/worker host with the fake
provider selected before module loading. Request interception is forbidden by the fixture. Reports
and feedback must appear in the recording sink; no OpenAI/GitHub credentials or production storage
are available. See `docs/TESTING.md` for the coverage boundary and negative controls. Hosted native
UI coverage has its own explicit command in `DEVELOPMENT.md` and never follows from this lane.
