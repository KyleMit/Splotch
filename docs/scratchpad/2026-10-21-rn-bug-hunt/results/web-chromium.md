# RN web — chromium

Candidate b236d639160459eecd60900926c759af5d4ae080. 01:57Z, 2026-10-21 UTC.

Production export and precache/startup checks: **pass**. See `../evidence/rn-web-build.log.txt`.
Local static host started on 127.0.0.1:6100, with real `web/static/coloring` assets and a
no-forwarding API response.

Phone 390×844 touch browser admission: **blocked before page creation**. See
`../evidence/browser-capabilities.json` and `browser-capabilities.log.txt`. Chromium: macOS
MachPortRendezvous bootstrap registration permission denied (1100), SIGTRAP. WebKit: Playwright
runner abort trap 6. Firefox: headless process SIGABRT. Installed binaries are present; this is
runtime admission failure, not missing dependencies.

D01 and all subsequent public UI cases are blocked by this engine admission failure. Tablet 820×1180
touch and desktop 1280×800 mouse are also blocked by the same launch prerequisite; they were not
represented as independent attempted UI runs. No product finding is inferred.

Reproduce admission with `node docs/scratchpad/2026-10-21-rn-bug-hunt/repro/check-capabilities.mjs`
while the local server is running. The first Chromium attempt used the phone options in
`repro/inspect.mjs`; it failed at browser launch. No page screenshots were produced.

## Supplemental Android Chrome run

Chrome 133.0.6943.137 on the dedicated emulator was reachable through CDP. It rejects
`Target.createBrowserContext`, so this uses the owned default context and fresh local
storage/origins. The requested 390×844 device metrics were not reflected in
`innerWidth`/`innerHeight`; actual width was 412, with height changing between browser chrome and
fullscreen. This is supplemental mobile-engine evidence. The requested host phone/tablet/desktop
matrix remains blocked.

The corrected run passed all five core checks:

| Check               | Status | Evidence                                                                                                        |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Boot                | pass   | `chromium-androidremote-boot.png`; actual viewport recorded in results JSON                                     |
| D01 cardinality     | pass   | `chromium-androidremote-cardinality.json`: separate 3, joined 1, admitted true                                  |
| D02 stroke          | pass   | Undo enables after a stroke; `chromium-androidremote-stroke.png`                                                |
| S01 section entries | pass   | Appearance, Sound, Tool Drawer, Accessibility, Coloring, AI Art, Saving; `chromium-androidremote-section-*.png` |
| L01 reload          | pass   | Reload starts blank with Undo disabled; `chromium-androidremote-blank-reload.png`                               |

See `chromium-emulator-core-corrected.log.txt`, `chromium-androidremote-results.json` and
`chromium-androidremote-network.json`: no page errors, unexpected external requests or API requests
in this core batch. Initial failures were harness issues: screenshot timeout and an unscoped
Coloring lookup selecting the root Coloring books button behind Settings. They are retained in
`chromium-androidremote-first-results.json` and the first-run log, not filed as defects.

The AI pass uses the existing AI-1 `/api` fixture, disables service-worker registration, checks that
no worker controls the page, and aborts every unmatched remote request. The first transaction missed
a lazily wired Settings opener; another checked the generation count before the upload finished and
accepted the original preview as a result image. The harness now retries opening Settings, waits for
its removal before drawing, waits for the generation request, and requires the result's Download
control. The earlier fixture did return and display its JPEG; its intercepted request metadata is
preserved in `chromium-androidremote-ai-race-results.json`.

The bounded AI pass also completed these checks on the fresh loopback origin at port 6102:

| Check                | Status | Evidence                                                                                                                                                   |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 prompt           | pass   | `chromium-androidremote-ai-prompt.png`; Sticker offered and selected                                                                                       |
| A02 result           | pass   | One intercepted generation POST, WebP upload, fixture JPEG displayed with Download; `chromium-androidremote-ai-result.png`                                 |
| A03 report           | pass   | No report before confirmation; exactly one intercepted multipart report POST, fixture 200, visible acknowledgement; `chromium-androidremote-ai-report.png` |
| A08 original storage | pass   | One attempt/original model in IndexedDB, zero original-model entries in localStorage                                                                       |

`chromium-androidremote-ai-results.json` retains the generation metadata and the earlier short
Download wait failure. `chromium-androidremote-ai-followup.json` proves the later result state,
report request/acknowledgement and IndexedDB counts. The finished card needs a longer wait than the
preview image; the follow-up asserts its Download control and the named result image. All unmatched
remote requests were blocked, no service worker controlled the AI page, and all API responses were
fixtures. No real generation or moderation report was sent.

The first two batches supplied nine bounded checks. Timeout/polling, offline AI, download, minimize
and full retention lifecycle remained unrun. Installed Android AI network flows remain blocked by
the fixture-transport constraint.

## Supplemental AI error and retry follow-up

Same candidate and Android Chrome 133; these do not fill host-profile cells. All API calls were
intercepted through AI-1; service workers disabled and controller absent. Independent origins used
ports 6104–6108, with an isolated bare-502 take at 6109. They reverse to the owned static server at
6103. No real generation or report was sent.

| Check                                   | Status | Evidence                                                                                                          |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| A04 server 500 → explicit retry         | pass   | `chromium-androidremote-error-results.json`, server500 row: POST 500 then POST 200, error and result PNGs         |
| A04 bare HTML 502 → explicit retry      | pass   | `chromium-androidremote-error-bare502-results.json`: POST 502 then POST 200; named result image/Download visible  |
| A04 malformed JSON → explicit retry     | pass   | `chromium-androidremote-error-results.json`, malformed row: safe error then one retry upload with fixture picture |
| A04 wrong content type → explicit retry | pass   | same JSON, wrongtype row; error/result originals under `chromium-androidremote-errors-wrongtype-*`                |
| A04 safety refusal 422                  | pass   | same JSON, refusal422 row: refusal/report control, no Try again and no report POST                                |

Each retryable case held at one generation request before the explicit retry, then exactly two;
upload byte counts matched. The safety refusal remained at one request. Screenshot filenames and
settle metadata are embedded in the result rows. `results/supplemental-web-ledger.json` lists the
fourteen unique passing supplemental checks without double-counting retries of the harness.

The first batch reused an origin: two setups did not admit ink, and wrong-content-type retry reached
the rest state without a second upload. Those takes are preserved under
`chromium-androidremote-error-first-results.json` and `chromium-androidremote-errors-first-*`. The
corrected driver waits for the engine/control readiness stamps and a settled root, uses fresh
origins, and foregrounds its tab. In the fresh batch the bare-502 case displayed a local preparation
error before any upload, so that row remains blocked. Its isolated follow-up completed the intended
502/retry sequence. These transient setup/pre-upload observations have no established cause or two
matching validated reproductions; they are not filed as product defects. Scoped Chrome logcat and
original blocked frames are retained. The explicit 502 console error in the isolated pass is the
expected fixture response.

**Total supplemental coverage: 14 bounded checks passed.** Polling/timeout, throttling/offline,
download, minimize, and full retention lifecycle remain unrun in this browser. Host Chromium's
phone/tablet/desktop cells remain blocked before page creation.
