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
| `npm run perf:device:hand`   | The same, with a **person** drawing in place of the injected touch — how a threshold gets measured |

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

## Calibrating from a hand

`perf:device:hand` is `perf:device:frames` with the injection half removed. The page instruments and
uploads itself identically, and a human draws instead of `adb shell input`. The symmetry is the
point: a hand number is only a calibration for a driven capture if one instrument read both.

It prints the verdict but never fails on it. A check the table records as uncalibrated not passing
is the reason the capture is being taken, so exiting non-zero would be reporting the question as an
error.

The artifact keeps the probe's **raw event rows**, which is what makes a person's time reusable —
every percentile and verdict is derived in Node, so a later revision of the expectation table
re-reads the file rather than asking for another finger. Keep hand captures under
`perf-profiles/evidence/` for that reason; its `index.json` carries each capture's reading and how
it was drawn, because how hard a person scribbles moves the numbers a threshold is set from.

The device cue matters more than it sounds. Whoever is drawing is holding the device, not watching
the terminal, so the Android path buzzes once when the window opens and twice when it closes. There
is no iOS equivalent, so an iPad run is driven by a person calling the start.

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

## The Android fidelity gate, and how it was closed

This transport fixes the defect that made Android cells meaningless — measured **116.6 contact moves
per second** against Appium's 46.8, at 0.98 moves per frame. For a while a capture still could not
be scored, because `pressure` and `contactGeometry` carried iPad-calibrated expectations that Chrome
cannot satisfy, and widening them to let Android pass would have destroyed the only thing they are
for.

The answer came from measuring rather than widening (ADR-0141). A hand capture and an `adb`-driven
capture, same phone, same night, same probe:

| Check              | real finger | synthesized touch |
| ------------------ | ----------: | ----------------: |
| `pressure` p50     |           1 |                 1 |
| `contactGeometry`  |        none |              none |
| `coalescedPerMove` |           0 |                 0 |

Three checks that answer identically however the touch was made cannot tell a hand from a robot, so
`android-chrome` does not ask them. Its verdict is `trustedTouch` and `cadence`, and `cadence` still
rejects what this transport exists to replace: 46.8 moves/s for the Appium path, against 115.9
driven here and 135.5–178.0 by hand.

## Failure behavior

Each failure names the thing to fix rather than the symptom — the page never reporting ready, the
engine committing a different brush than requested, the page rendering at a different orientation
than the one requested, or a capture that recorded no pointer events at all (which means the gesture
landed somewhere other than the canvas, usually a brush menu left open over the paper). A dispatch
whose page pulsed **zero** input events fails immediately naming the wrong-tab cause — Chrome's
session restore fronted a stale tab while the run's page loaded behind it (issue 1294) — instead of
spending the report timeout; the launcher also re-activates the run's page over the devtools HTTP
endpoint after launch and before dispatch, which fails benignly when the page cannot be identified.

## Domain ownership

* `lib/android-input.mjs` — replaying a W3C pointer plan as `input swipe` segments, and the rotation
  settings. Pure; this is where the interesting mistakes live.
* `lib/page-bootstrap.mjs` — the script injected into the page. Takes its brush selectors from
  `../../ios/capture-xcuitest-screen.mjs` rather than duplicating them.
* `lib/probe-host.mjs` — the proxying HTTP host and its report endpoints.
* `lib/report-store.mjs` — which of two uploaded reports to keep.
* `lib/chrome-tabs.mjs` — clearing this tooling's own leftover tabs and activating the run's page
  over the devtools HTTP endpoint. Ownership is a tool signature (a `?probe=`/`?verify=` run param
  or the `/__probe/stand-down` path) on the session host, across every port the tooling serves — the
  tab that steals the foreground on relaunch is whichever Chrome used last, including another tool's
  stale page on a different port. Nothing without a signature is ever closed: not operator tabs, not
  other apps' Custom Tabs on the same socket, not a bare about:blank, and not the host's plain
  preview pages. Activation alone was tried first and lost the session-restore race while reporting
  success.

`nativeCanvasBounds`, `trustedGestureActions` and `inputFidelity` are imported from
`../ios/capture-xcuitest-screen.mjs`. They are not iOS-specific despite living there; moving them to
`tools/perf/lib/` would be the tidier home and has not been done because that module is large and
well covered where it is.

Tests live in `tools/perf/tests/split-capture.test.mjs` rather than a nested `tests/` directory, so
Vitest's existing include glob keeps collecting them.
