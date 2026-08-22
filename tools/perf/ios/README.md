# iOS performance capture

These entry points collect physical-device and Appium evidence:

* `perf:ios:webkit:gates` attaches to Mobile Safari through the WebKit Inspector Protocol and runs
  the engine gates.
* `perf:ios:webkit:frames` captures real-screen frame, input, paint, and optional Timeline data.
* `perf:ios:xcuitest:screen` drives trusted native-coordinate drawing and undo through Appium.
* `perf:ios:xcuitest:actions` drives the shared discrete-action regression sweep through Appium.
* `perf:ios:verify:tap` checks that a trusted finger tap still activates a toolbar button after a
  rotation (issue 1194) — four PASS/FAIL scenarios, no timing gates.

Each npm command has a build pre-hook; use the documented `--ignore-scripts` form only when the
instrumented bundle is already current. Runs require the device, relay/Appium, signing, and trust
setup described in [`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md). Evidence is written
beneath `perf-profiles/`, and failures to attach, meet fidelity requirements, collect requested
samples, or pass enforced gates exit non-zero.

iOS attachment and trusted-touch orchestration stay here. WebKit protocol plumbing, statistics,
thresholds, and artifact schemas belong in `../lib/`; injected browser payloads belong in
`../probes/`. The behavior-preserving issue #975 manifest also keeps the cross-platform action plan
in `capture-xcuitest-actions.mjs` and the reusable probe configuration in
`capture-webkit-frames.mjs`; web and Android runners import those deliberate owners.

## `perf:ios:verify:tap` — tap activation after rotation

Correctness, not performance: it answers "does a real finger still work?" and gates nothing on
timing. It exists because issue 1194 turned out not to be an undo bug at all — WKWebView configured
with `ios.contentInset` reports `PointerEvent` client coordinates shifted up by the top content
inset while `TouchEvent` coordinates, layout and hit-testing are not, so `scribbleTap`'s
`elementFromPoint` re-test answers for a point outside the button the browser itself targeted. The
skew is the viewport's own `screen.height - innerHeight`: present in portrait, absent in landscape.

```sh
npm run perf:ios:verify:tap -- --device-id=<udid>
```

Needs a booted simulator or attached device, a running Appium server, and the app already installed;
it drives the installed build rather than serving one. Four scenarios, all four must pass:

| Scenario | What it proves |
| --- | --- |
| `restore-after-LANDSCAPE-start` | The reported bug: rotate the blank canvas landscape to portrait, tap undo, the drawing comes back. |
| `restore-after-PORTRAIT-start` | The direction that already worked, kept as a regression guard. |
| `drag-off-cancels` | Pressing undo and sliding away does *not* undo — a fix must not over-trigger. |
| `wiggle-tap-activates` | A tap that smudges 12px inside a 55px button still fires. |

The last row is the one that earns its keep. A fix that only corrects the release check in `up()`
passes the first three and fails this one, because `move()` has already classified the press as a
drag from the same bad coordinates. It is the difference between a fix and a fix that looks right in
review.

A restore is only credited when the tap's own `pointerdown` targeted `#undoButton`, so a stray dot
drawn on the canvas can never be mistaken for a restored drawing. Two setup steps are load-bearing
and were each got wrong once during the original investigation: rotation is locked by a persisted
app setting that has to be cleared first, and undo lives inside the collapsible drawer, which is
closed by default — tapping it while collapsed hits a `visibility: hidden` control and reproduces
nothing.

Appium's WebInspector connection on the simulator wedges after repeated sessions, surfacing as "The
remote Safari debugger did not respond". Rebooting the simulator is the fix; nothing in the app or
this harness causes it.
