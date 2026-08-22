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
whatever the previous capture selected. Select every brush explicitly, pen included, and assert
`window.__committedBrushMode()` matches before measuring.

**Safari runs two instances of one navigation.** The second records nothing and, without a guard,
its empty tables overwrite the real capture. Stamp each run with a nonce the page echoes back, and
keep whichever report saw more input.

**A brush menu left open covers the paper.** The gesture then lands on the menu and the capture has
frames but zero pointer events. Before measuring, check that `document.elementFromPoint` at the
canvas centre actually hits the canvas.

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
