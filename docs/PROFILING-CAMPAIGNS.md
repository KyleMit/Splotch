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

## What is unavailable on a device with no Web Inspector switch

If Settings has no Web Inspector toggle — check Apps → Safari → Advanced, Developer, and Settings'
own search — then every tool built on the WebKit Inspector Protocol is closed on that device, and
none of them says so clearly:

* `perf:ios:webkit:gates` and `perf:ios:webkit:frames`, which inject and read back over that
  channel.
* `perf:ios:webkit:frames --timeline`, the only programmatic source of WebKit
  Composite/Paint/RecalculateStyles records.
* `perf:analyze:web-inspector`, which reads a Timeline export a human makes from Safari's Develop
  menu — so it cannot be run unattended even where the switch exists.

`ios_webkit_debug_proxy` will still list the *device*; it just reports zero pages. That is the tell.

Appium's XCUITest transport is unaffected: it reaches Safari over a different channel and can still
execute script, drive trusted touch, and read the probe's tables. So a capture campaign is possible
without Web Inspector; **compositor-level attribution is not**, and a question that needs to know
where non-JavaScript frame time goes will have to wait for a device that has the switch.

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
