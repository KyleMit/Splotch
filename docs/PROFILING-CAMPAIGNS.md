# Running a physical-device performance campaign

Read this before an unattended capture run. `docs/PROFILING.md` covers what each command measures
and `docs/PROFILING-IPAD.md` covers the iPad transport; this file is about the ways a campaign
produces **numbers that look fine and are wrong**.

Start every run with:

```sh
npm run perf:preflight -- --fix
```

It refuses to report ready while anything below is unresolved, reuses whatever is already running
rather than asking for another approval, and moves off a contended port instead of stopping a
listener another session owns.

## The failure mode this file exists for

Every trap below shares one shape: **it does not raise an error.** The capture completes, writes a
well-formed artifact, and reports a plausible number. The 2026-08 issue-1196 campaign hit six of
them, and three separately were each enough to fail all 32 physical-web drawing cells.

So: a capture that ran clean is not evidence the setup was right. Check the fidelity verdict, check
the input cadence, and compare against the previous run of the same cell before believing a change.

## Device identity

**An iPad answers to two different identifiers and they are not interchangeable.**
`xcrun devicectl list devices` prints a CoreDevice UUID (`BF6A40F5-…`). Appium's `appium:udid` wants
the hardware UDID that `idevice_id -l` prints (`00008103-…`). Passing the CoreDevice UUID fails with
**"Could not find a pair record for device …"**, which reads like an unreachable device or a missing
tunnel and is neither. `perf:preflight` prints the right one and rejects the wrong one.

## Approvals that are probably already granted

**Check for a running RemoteXPC tunnel before starting one.** It is root-owned, its password prompt
goes to a macOS GUI dialog, and an unattended session cannot answer it — but another session on the
same host may already have one up, in which case nothing is needed. `pgrep -fl tunnel-creation.mjs`
answers it. Starting a second one fails with `EADDRINUSE` on the tunnel registry port, which is
harmless but wastes an approval round-trip.

The same applies to the Appium server and to WebDriverAgent: look first.

## Port contention between sessions

**Two Appium servers cannot share a WDA port.** The second one forwards host `8100` to the device,
finds the first one already owns that forward, and proxies into the *first server's* WDA session.
The symptoms are `WebDriverAgent is not initialized` and `Session does not exist` — neither of which
mentions a port.

The fix is `appium:wdaLocalPort` on a free port (8110, 8120, …) and `--appium-url` pointing at your
own server, never stopping theirs. `CLAUDE.md`'s concurrent-worktree rule says the same thing:
*"Treat `EADDRINUSE` as a request to select another port and retry… Stop only a PID, process group,
or tool handle created and recorded by the current session."*

## A build that is not the build you think

**`pkill -f serve-profile-build` does not stop the preview server.** It kills the wrapper; the vite
child keeps the port and keeps serving the SvelteKit manifest it loaded at startup. The next capture
then measures the *previous* build, and the failure is silent in a specific and nasty way: the
served HTML names chunk files that no longer exist, the modules 404, the route never hydrates — and
because the drawing route is server-rendered, every selector still resolves and every button still
exists. The capture measures dead markup.

Kill by port, then prove the served HTML and its chunks came from the same build:

```sh
entry=$(curl -s http://127.0.0.1:4173/ | grep -o '/_app/immutable/entry/start\.[^"]*\.js' | head -1)
curl -sf -o /dev/null "http://127.0.0.1:4173$entry" || echo "stale manifest"
```

A page that did hydrate exposes `window.__committedBrushMode`; a page that did not, does not.

## Capture state that survives between runs

**The brush is persisted.** A capture that assumes pen is the default draws its "pen" strokes with
whatever the previous capture selected — captures share an origin, so the tool choice survives the
navigation. Select every brush explicitly, pen included, and assert `window.__committedBrushMode()`
matches before measuring.

`perf:ios:xcuitest:screen` had exactly this bug and skipped selection for pen. It cost a full
verification round: an iPad campaign ordered `crayon pen magic eraser` reported a pen cell of 1.90%
that was crayon's 1.85% wearing pen's label, complete with crayon's 0.15 ms/frame engine cost
against pen's 0.12. The tell is a "pen" number that tracks the brush captured before it. **Vary the
brush order between runs** — a contaminated cell moves with the order and a real one does not.

**Safari runs two instances of one navigation.** The second records nothing and, without a guard,
its empty tables overwrite the real capture. Stamp each run with a nonce the page echoes back, and
keep whichever report saw more input.

**A brush menu left open covers the paper.** The gesture then lands on the menu and the capture has
frames but zero pointer events. Before measuring, check that `document.elementFromPoint` at the
canvas centre actually hits the canvas.

## `ios_webkit_debug_proxy` is obsolete on iOS 17 and newer

If it lists the *device* but reports zero *pages*, the device is fine and the tool is not. Apple
moved the web inspector service behind RemoteXPC on iOS 17; `ios_webkit_debug_proxy` still asks the
old lockdown service and comes back empty. That failure reads exactly like a disabled Web Inspector
setting, and a campaign can lose a day to it.

Confirm which it is before concluding anything:

```sh
pymobiledevice3 webinspector opened-tabs     # speaks the modern path
```

A tab listed there means remote inspection works and the tooling is what needs updating. Safari's
Develop menu on a paired Mac is the same check by hand.

`perf:ios:webkit:gates` and `perf:ios:webkit:frames` both go through the old proxy, so both are
affected; repointing them at `pymobiledevice3` is the fix rather than declaring the capture path
unavailable. `perf:analyze:web-inspector` is separate — it reads a Timeline export a human makes
from Safari's Develop menu, so it cannot run unattended regardless.

### What the pymobiledevice3 CDP bridge does and does not carry

`pymobiledevice3 webinspector cdp` serves a Chrome-DevTools-shaped endpoint on `127.0.0.1:9222`, and
`webinspector launch <url>` puts the page in `/json/list` so it has a `webSocketDebuggerUrl`. Two
things about it cost an afternoon each, so take them as given:

* **Match replies by `id`.** The socket's first inbound message is an unsolicited
  `Target.targetInfoChanged` event, not the answer to your first command. A client that resolves on
  the first frame it receives concludes every method timed out, which is exactly wrong — the bridge
  is answering.
* **Only part of the protocol is translated.** `Runtime.evaluate`, `Page.enable`, `Timeline.start`,
  `Timeline.stop`, and `Timeline.setInstruments` all return `OK`. `Tracing` and `Performance` come
  back `'<domain>' domain was not found`, so the Chrome-shaped tracing capture has no counterpart
  here.

`Runtime.evaluate` against the real iPad Safari page is the durable win — it is the piece that makes
an unattended in-page capture possible at all. **Timeline is not** the frame-level instrument it
looks like: a recording spanning 200 painted `requestAnimationFrame` frames emitted a *single*
`Timeline.eventRecorded`, one aggregated `RenderingFrame` carrying one child each of
`ScheduleStyleRecalculation`, `RecalculateStyles`, `Composite`, and `RequestAnimationFrame`. Counts
that coarse cannot attribute per-frame cost between two brushes. Reach for `xctrace` against the
native build for frame-level timing, and use the bridge for what the page itself can measure.

## Input cadence is a result, not a detail

**Check the fidelity verdict on every capture, and never score a run that fails it.** Appium's
Android browser path delivered **46.8 contact moves per second** against a fidelity band of 100–170,
and every Android cell in the 2026-08-21 campaign recorded `cadence: false`. Chrome raises the
display to 120 Hz only while touch is arriving, so at that cadence the panel falls back to 60 Hz and
the lost-frame metric reads the fallback as dropped frames. Those cells reported 10.1–31.7%; the
same build at 116 moves/s reports 0.41–1.55%.

Transports differ in what they can produce, and a change aimed at one condition cannot be judged on
a transport that cannot create it:

| Transport                            | Contact moves/s | Notes                                      |
| ------------------------------------ | --------------: | ------------------------------------------ |
| Appium XCUITest (iPad)               |         115–117 | Calibrated. ~1.95 moves per painted frame. |
| `adb shell input swipe` (Android)    |         113–120 | Fidelity-passing.                          |
| WebDriverAgent HTTP directly (iPad)  |           60–61 | Below the band; ~0.9 moves per frame.      |
| Appium UiAutomator2 (Android Chrome) |              47 | Below the band. Do not score.              |

## The device going to sleep

Android sleeps mid-campaign and locks. `npm run perf:preflight -- --fix` wakes it and sets
`svc power stayon true`, but **a device with a passcode cannot be unlocked from the host** — the
preflight blocks and says so. For an overnight run, unlock it first and leave it on the charger.

### Guided Access blocks every capture, disguised as a WebDriverAgent build error

`xcodebuild failed with code 65` from Appium reads like a signing or Xcode problem and is neither.
Run the `xcodebuild` line the Appium log prints and look past the exit code: the build says
`** TEST BUILD SUCCEEDED **` and the *launch* is what failed.

**Read to the innermost underlying error, not the first one.** The outer frames name a service that
has nothing to do with the cause:

```
The application failed to launch.
Failure Reason: The request was denied by service delegate (SBMainWorkspace) for reason: Unspecified.
  (Underlying Error: Guided Access active)
```

Guided Access locks the iPad to one app, so SpringBoard refuses to launch the WebDriverAgent runner
and every capture on that device fails. It is plausible to find on this project's hardware in
particular — Splotch is a toddler app, and Guided Access is exactly what a parent turns on to lock a
child into it. Ending it needs the on-device passcode, so no host-side tool can clear it.

Everything cheap still passes while this is true. The device stays enumerated in `idevice_id -l`,
`ideviceinfo -k DeviceName` answers, the RemoteXPC tunnel stays up, and `perf:preflight` reports
ready — none of them launch an app, which is the only operation Guided Access blocks.

Two wrong paths this signature invites, both taken on 2026-08-22 before the underlying error was
read:

* **"The device is asleep."** `SBMainWorkspace` denials do happen for a sleeping display, so the
  outer message is consistent with it, and `ideviceinfo -k PasswordProtected` returning `false`
  looks like corroboration. It reports whether a passcode is set, not whether the screen is on, so
  it corroborates nothing.
* **"A stale automation session is blocking Safari."** A leftover *Safari is Running an Automated
  Test* alert can genuinely be on screen at the same time, because a killed campaign leaves the
  session registered. It is worth clearing — **Stop Test Session**, never **Turn Off Automation**,
  which flips off Settings → Safari → Advanced → Remote Automation and breaks every later capture
  until it is switched back on by hand — but it is not what denies the launch.

## Recapturing matrix cells

Cells in the performance matrix can be **preserved evidence** — carried forward from the published
`data.json` because raw captures land in gitignored `perf-profiles/` scratch and do not survive a
clean checkout. Check `preservedSections` on the mode before concluding anything about a number:

```sh
node -e "const d=require('./scrapbook/performance/2026-07-31-deployment-target-matrix/data.json');
  const t=d.targets.find(x=>x.id==='ipad-device-web');
  for (const m of t.modes) console.log(m.id, JSON.stringify(m.preservedSections))"
```

A preserved cell is not rescored when the metric changes, so a gate correction lands in the matrix's
gates block and nowhere else. The cells keep whatever the estimator produced on the day they were
captured until they are captured again on the capture host. **A matrix number and a fresh capture of
the same cell can legitimately disagree by more than the gate**; find out which one you are reading
before treating a difference as a regression.

Three things about `perf:campaign` that each cost a launch:

* **It needs device identity.** Without `--device-id=<hardware UDID>` (or `--capabilities-file=`)
  every cell fails instantly with `Pass --device-id= for a local iPad`, and 20 cells burn 60
  attempts in seconds.
* **The ledger remembers exhausted cells across runs** and will not retry them — the resume message
  is `3 attempts exhausted in earlier runs, not retried`. That is correct for a real device failure
  and wrong after a misconfigured launch. Read `ledger.tsv` before clearing it: if every row is
  `missing-or-invalid-json-exit-1` and no artifact was produced, the attempts recorded nothing and
  deleting the ledger costs nothing.
* **Its Android drawing transport is the one ADR-0135 measured at 46.8 moves/s**, below the 100–170
  fidelity band. Cells captured that way must not be scored. Promoting the split input/measurement
  transport into `tools/` is the fix; until then an Android recapture through the campaign produces
  artifacts that parse — so the campaign accepts them — and still fail the fidelity verdict.

`perf:ios:xcuitest:screen` drives Android too, despite the name.

## Serialize the captures, but keep both devices alive

**Never capture Android and iOS at the same time.** Both campaigns drive input from this host, and
host contention changes input cadence — the variable that produced the false Android failures in the
first place. Chain them: finish one device's run, then start the other's.

**Keep both devices awake and reachable throughout anyway.** The idle device has to be ready when
its turn comes, and — more often — ready afterwards, when a result raises a question that only
another capture can answer. Tearing one down between phases turns a two-minute verification into a
restart.

`npm run perf:preflight -- --fix --watch` holds both: it re-asserts Android's stay-awake every 60
seconds and reports the moment either device goes away. It can only *observe* the iPad — nothing on
the host can hold an iPad awake, so set **Settings → Display & Brightness → Auto-Lock → Never** on
the device itself. An active XCUITest session keeps it awake during a capture; the gaps are the
risk.

## Do not tear the devices down when a campaign ends

Leave stay-awake set, leave the tunnel up, leave the Appium server and WebDriverAgent running, and
leave the preview server serving, until a human says otherwise.

This is not tidiness versus laziness — it is the difference between answering a follow-up question
in two minutes and spending twenty rebuilding the rig. It has cost this project real time twice: a
cleanup pass that ran `svc power stayon false` let the phone sleep and lock, so the next session
opened on an unusable device; and killing an `iproxy` forward left a WebDriverAgent process stranded
on the iPad, which then failed to launch with an error that named neither the port nor the stale
process.

The one thing worth reverting is a debug override that changes what the device reports about itself
— `adb shell dumpsys battery reset` if the watch ever forced a plugged state. Everything else stays
up.

## Instruments scope: `--all-processes` is not the perturbation you expect

The intuition is reasonable — sampling every thread in every process should cost more than sampling
one — so it was measured rather than assumed. Same native crayon gesture, three conditions, scored
by the app's own probe:

| Condition                            |     Lost % | Late frames | Moves/s | JS per frame |
| ------------------------------------ | ---------: | ----------: | ------: | -----------: |
| No trace at all                      | 1.05, 0.96 | 1.90, 1.65% |     116 |   0.26, 0.24 |
| `Time Profiler --attach` one process | 0.86, 0.92 | 1.62, 1.83% |     116 |         0.25 |
| `Time Profiler --all-processes`      |       0.97 |       1.53% |     116 |         0.25 |

No measurable difference; every value sits inside the ±0.15 run-to-run spread this device shows at
three samples. Input cadence and marked JS work are identical across all three, so the app was not
slowed — the probe would have seen it in either.

**So prefer `--all-processes` for a sampling template**, and not merely because it is free. One
trace containing every process preserves per-frame correlation *across* processes, which is the
whole point when the interesting work is split between the app, `com.apple.WebKit.WebContent` and
`com.apple.WebKit.GPU`. Capturing one layer at a time forces correlation across separate runs with
separate clocks — statistical at best, never per-frame.

One limit on that finding, because it does not generalize: it covers **sampling** templates. Time
Profiler interrupts on a timer; templates that *instrument* rather than sample — Allocations, Leaks,
Zombies — hook every call of interest and can be orders of magnitude heavier. Re-measure before
trusting scope-independence there.

Wide scope does produce far more data — an `--all-processes` Time Profiler run exported to 119 MB of
XML against roughly 44 KB per table from a single-app Animation Hitches trace. Disk is not the
reason to care and should not narrow a capture; budget for the export and parse instead, and prefer
`--xpath` over reading a whole export into memory.

The general rule this belongs to: when instrumentation might be changing what it measures, measure
it. The app's own probe scored against a no-trace control answers it in ten minutes, and the same
technique applies to the in-page probe and `PERF_MARKS`.

## Never run anything heavy on the host during a capture

The host drives the input dispatch. A test suite, a build, or a second campaign competing for CPU
changes the input cadence — which is the variable that corrupted the Android cells in the first
place. Sequence the work: captures, then builds, then tests.

## Metric traps

Two are fixed and one is proposed; all three are worth recognizing in a number.

* **The frame beat is estimated, not read from the hardware** (ADR-0134). It used to be a low
  percentile, which on a variable-refresh display lands below the rate the display actually held and
  charges the app for on-time frames.
* **A "late" frame followed immediately by a very short one is usually not a lost frame**
  (ADR-0136). On a ProMotion iPad, 93% of late frames are the long half of a pair that sums to two
  beats — a callback slipping and rejoining the grid while the display presents steadily. The floor
  control scores 1.46% under the current charge and 0.02% once the pair is credited.
* **`lostFrameTimeShare` is a share of in-contact *time*, not of frames.** The frame share is
  roughly double it. Say which you mean.

## Before believing a result

1. Fidelity verdict passed, and the input cadence is in band.
2. The served build's manifest resolves.
3. The committed brush matches the requested one.
4. At least three samples per cell — the within-config spread on a physical device is routinely
   comparable to the effect being measured.
5. The previous run of the same cell, for comparison. A single absolute number from this gate has
   been wrong more often than it has been right.
