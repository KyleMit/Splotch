# `tools/perf/split-capture/` — device capture with input and measurement split

Drives a drawing capture on a **physical** device where the touch input and the measurement travel
on separate channels (ADR-0135). Input is the platform's own trusted injection; measurement is the
page instrumenting itself and uploading a report over ordinary HTTP.

`docs/PROFILING-MECHANICS.md` is the cross-cutting reference — every transport, what each drives,
and the drivers ruled out. This file stays the detail on *this* transport's mechanics and failure
modes.

## Why it exists

Every other capture path drives input and reads measurement down the same debugger connection, and
that connection is the fragile part:

* **Android.** The Appium browser transport delivers **46.8 contact moves per second** — 0.44 moves
  per frame, against the density floor `FIDELITY_MOVES_PER_FRAME_MIN` sets (ADR-0145 retired the
  rate band this once quoted, because a rate encodes the panel's refresh rather than the stream).
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
| `npm run perf:device:frames` | Opens the page, dispatches trusted drawing and optional undo, then scores and writes the report    |
| `npm run perf:device:hand`   | The same, with a **person** drawing in place of the injected touch — how a threshold gets measured |

Run the host first; it binds `0.0.0.0` because the device loads it over the LAN.

`perf:campaign` drives this path for any target that declares `transport: 'split'` in
`tools/perf/lib/campaign-plan.mjs`, which owns that list. It asserts the probe host answers before
its queue starts rather than starting one itself, so `perf:device:serve` still has to be running.

```sh
npm run perf:build
npm run perf:serve -- --port=4173 --strict-port &
npm run perf:device:serve -- --port=4175 &

npm run perf:device:frames -- --platform=android --device-serial=<serial> \
  --host=http://<lan-ip>:4175 --brush=crayon --orientation=LANDSCAPE --theme=light \
  --output=perf-profiles/split-capture/crayon.json
```

For iPadOS, pass `--platform=ios --wda-url=http://127.0.0.1:8100` and leave `--device-serial` off;
WebDriverAgent must already be running and reachable. The driver turns the iPad to `--orientation`
through WebDriverAgent before it opens the page, because the page reports its geometry once. It then
turns the iPad back and deletes its WDA session when the report arrives or the capture is refused.
Safari is navigated after the turn. The native app is stopped and cold-launched after it, because
WebDriverAgent's launch only brings an app that is already running to the front. A window that does
not follow the turn within the timeout fails before the page opens and names the rotation locks. On
the rig iPad each `POST /orientation` call returned after about 10.3 s, with the window already
turned.

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

## Capturing the floor control

`npm run perf:device:floor` serves the floor control (ADR-0136): one canvas, one `stroke()` per
pointermove, the same probe. Point `perf:device:frames` at it in place of the probe host:

```sh
npm run perf:device:floor -- --port=4177 &
npm run perf:device:frames -- --platform=ios --wda-url=http://127.0.0.1:8100 \
  --host=http://<lan-ip>:4177 --brush=pen --theme=light
```

The capture reads `page: 'floor-control'` from `/__probe/state` and swaps the SvelteKit served-build
guard, which a page with no build can never pass, for the floor's own identity check: every file the
floor serves must match this checkout's `serve-floor-control.mjs` and probe byte for byte. It
refuses what the floor cannot honour — `--native-app`, a brush other than pen, a theme other than
light, undo — before touching the device. The artifact records `page: 'floor-control'`, a floor
`buildDigest`, and no `productCommit`, so the matrix fold refuses it: a floor capture is a
diagnostic, never a cell.

## Inputs and outputs

`--host` is the probe host URL **as the device sees it** — a LAN address, not `127.0.0.1`. Android
Chrome is the exception: the page opened over adb loads that host at `localhost` through
`adb reverse` (`../lib/android-localhost-route.mjs`), because Chrome's *Always use secure
connections* setting hides a plain-`http` LAN origin behind a warning page. The artifact records
`orientation`, `theme`, and the `fidelity` verdict alongside the summaries, because the performance
matrix validates a capture against the mode it was filed under and refuses one that cannot prove
which mode it measured.

`--undo-count=<n>` is valid only with `--brush=pen`. After the trusted gesture finishes, the page
runs the shared canonical undo action source and records the raw engine/next-frame timings, the
history depth before and after, and a canvas digest around every action. The campaign's pen cell
sets the count to ten. Campaign status, source folding, and matrix generation all reject a split pen
artifact unless it proves the complete count, exact history reduction, and a pixel change for every
undo.

The CLI exits non-zero when the fidelity gate fails, **after** writing the artifact. That ordering
is deliberate — the failed capture is kept for inspection — but it means an artifact that parses is
not the same as an artifact that can be scored. The campaign runner reads the `fidelity` verdict the
artifact carries for exactly this reason, and records a fidelity failure as `failed-input-fidelity`
rather than banking the cell.

An Android capture also exits non-zero, the same way, when the page's trusted pointerdowns differ
from `dispatchedStrokes`, the count of `adb shell input swipe` calls. A touch an overlay drops never
reaches the page, and the strokes that did arrive still pass fidelity, so the count is the only
witness (issue 2229). The message names both counts. `../lib/stroke-delivery.mjs` holds the one
rule; campaign acceptance records such a capture as `failed-input-fidelity`, and the person
session's verdict asks for a redo.

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
spending the report timeout; the launcher also clears the tooling's own leftover tabs and
re-activates the run's page over the devtools HTTP endpoint, after launch and before dispatch,
skipping benignly when the devtools socket or the page cannot be reached.

## Domain ownership

* `lib/android-input.mjs` — replaying a W3C pointer plan as `input swipe` segments, and the rotation
  settings. Pure; this is where the interesting mistakes live.
* `lib/page-bootstrap.mjs` — the script injected into the page. Takes its brush selectors from
  `../../ios/capture-xcuitest-screen.mjs` rather than duplicating them.
* `lib/probe-host.mjs` — the proxying HTTP host, its report endpoints, and the inert
  `/__probe/stand-down` husk page stale bootstraps park themselves on.
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
