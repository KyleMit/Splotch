# `tools/perf/split-capture/` — device capture with input and measurement split

Drives a drawing capture on a **physical** device where the touch input and the measurement travel
on separate channels (ADR-0135). Input is the platform's own trusted injection; measurement is the
page instrumenting itself and uploading a report over ordinary HTTP.

## Why it exists

Every other capture path drives input and reads measurement down the same debugger connection, and
that connection is the fragile part:

* **Android.** The Appium browser transport delivers **46.8 contact moves per second** against the
  100–170 fidelity band, at 0.44 moves per frame with pressure and contact geometry reading zero.
  Cells captured that way fail the fidelity verdict and cannot be scored — and worse, they score
  ~11% lost frame time, because `lostFrameTimeShare` prices the gaps between sparse input as lost
  frames. A red cell produced that way looks like a catastrophic regression and means nothing.
* **iPadOS 17+.** `ios_webkit_debug_proxy` lists no pages, because Apple moved the web inspector
  service behind RemoteXPC (see `docs/PROFILING-CAMPAIGNS.md`).

Splitting the channels removes the dependency: the page needs no script channel, and the input path
only has to be able to touch the screen.

## Entry points

| Command                      | Does                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run perf:device:serve`  | Serves the perf build with the probe bootstrapped in, and collects the uploaded report             |
| `npm run perf:device:frames` | Opens the page on the device, dispatches trusted touch, waits for the report, scores and writes it |

Run the host first; it binds `0.0.0.0` because the device loads it over the LAN.

`perf:campaign` drives this path for any target that declares `transport: 'split'` — today
`android-device-web`. It asserts the probe host answers before its queue starts rather than starting
one itself, so `perf:device:serve` still has to be running.

```sh
npm run perf:build
npm run perf:serve -- --port=4173 --strict-port &
npm run perf:device:serve -- --port=4175 &

npm run perf:device:frames -- --platform=android --device-serial=<serial> \
  --host=http://<lan-ip>:4175 --brush=crayon --orientation=LANDSCAPE --theme=light \
  --output=perf-profiles/split-capture/crayon.json
```

For iPadOS, pass `--platform=ios --wda-url=http://127.0.0.1:8100` and leave `--device-serial` off;
WebDriverAgent must already be running and reachable.

## Inputs and outputs

`--host` is the probe host URL **as the device sees it** — a LAN address, not `127.0.0.1`. The
artifact records `orientation`, `theme`, and the `fidelity` verdict alongside the summaries, because
the performance matrix validates a capture against the mode it was filed under and refuses one that
cannot prove which mode it measured.

The CLI exits non-zero when the fidelity gate fails, **after** writing the artifact. That ordering
is deliberate — the failed capture is kept for inspection — but it means an artifact that parses is
not the same as an artifact that can be scored. The campaign runner reads the `fidelity` verdict the
artifact carries for exactly this reason, and records a fidelity failure as `failed-input-fidelity`
rather than banking the cell.

## The Android fidelity gate is not yet satisfiable

This transport fixes the defect that made Android cells meaningless — measured **116.6 contact moves
per second** against Appium's 46.8, at 0.98 moves per frame — but a capture still fails the gate on
two checks:

| Check             | Android via `adb` | Required  |
| ----------------- | ----------------: | --------- |
| `cadence`         |     116.6 moves/s | 100–170   |
| `pressure`        |                 1 | exactly 0 |
| `contactGeometry` |              0 px | 40–100 px |

Both failing thresholds are iPad-calibrated. `inputFidelity` says so in its own comment — they come
from a hand capture on the target iPad, where Safari reports pressure 0 and a contact radius around
74 px. Chrome reports pressure 1 for synthesized touch and no contact radius at all, so **no Android
input path can satisfy them**, including Appium's (which fails `contactGeometry` too, and passes
`pressure` only incidentally).

Do not widen the gate to make Android pass. What the checks are for is proving a run exercised the
real touch path, and the honest fix is platform-scoped expectations calibrated the same way the iPad
ones were: a hand capture on the Android device, drawn with a finger, read for what Chrome actually
reports. Until that exists, an Android capture from this path is **better** than an Appium one on
the axis that corrupted the numbers, and still not formally scoreable.

## Failure behavior

Each failure names the thing to fix rather than the symptom — the page never reporting ready, the
engine committing a different brush than requested, the page rendering at a different orientation
than the one requested, or a capture that recorded no pointer events at all (which means the gesture
landed somewhere other than the canvas, usually a brush menu left open over the paper).

## Domain ownership

* `lib/android-input.mjs` — replaying a W3C pointer plan as `input swipe` segments, and the rotation
  settings. Pure; this is where the interesting mistakes live.
* `lib/page-bootstrap.mjs` — the script injected into the page. Takes its brush selectors from
  `../../ios/capture-xcuitest-screen.mjs` rather than duplicating them.
* `lib/probe-host.mjs` — the proxying HTTP host and its report endpoints.
* `lib/report-store.mjs` — which of two uploaded reports to keep.

`nativeCanvasBounds`, `trustedGestureActions` and `inputFidelity` are imported from
`../ios/capture-xcuitest-screen.mjs`. They are not iOS-specific despite living there; moving them to
`tools/perf/lib/` would be the tidier home and has not been done because that module is large and
well covered where it is.

Tests live in `tools/perf/tests/split-capture.test.mjs` rather than a nested `tests/` directory, so
Vitest's existing include glob keeps collecting them.
