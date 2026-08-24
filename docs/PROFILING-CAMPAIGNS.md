# Running a physical-device performance campaign

Read this before an unattended capture run. `docs/PROFILING.md` covers what each command measures
and `docs/PROFILING-IPAD.md` covers the iPad transport; this file is about the ways a campaign
produces **numbers that look fine and are wrong**.

Start every run with:

```sh
npm run perf:preflight -- --wake-android --verify-android-input --verify-ios-launch
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

**A resolving manifest proves self-consistency, not whose build it is.** This host runs dozens of
Codex worktrees, and a preview server left up by one of them keeps the canonical port for as long as
it lives — on 2026-08-23, port 4173 was serving a *different worktree's* build from the night
before, and every identity check above passes against it because that build is internally fine.
`lsof -nP -iTCP:4173 -sTCP:LISTEN` names the process, and its command line names the checkout:

```sh
ps -o command= -p "$(lsof -tnP -iTCP:4173 -sTCP:LISTEN | head -1)"
```

If that path is not this checkout, do not capture against it. Serve your own build on a free port
and pass `--url=`/`--probe-host=` explicitly; the campaign is happy to be pointed anywhere, which is
exactly why the pointing has to be deliberate.

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

### A failed verdict has two meanings, and they need different work

`inputFidelity` states its expectations **per capture runtime** (ADR-0139), because three of its
five checks describe a runtime rather than describing faithful input. So read *which* check did not
pass:

* **A failed check is a bad run.** `cadence` says the app was barely driven and the number is
  meaningless; `trustedTouch` says the input never went through the real touch path. Recapture.
* **An `(uncalibrated)` check is a silent instrument.** No hand capture has recorded what that
  runtime reports, so there is no expectation to judge against. Recapturing changes nothing; the fix
  is to measure the runtime. It is **not** a pass — a capture resting on an unmeasured threshold is
  as unscoreable as an under-driven one.

Today every Android and desktop runtime is uncalibrated on `coalescing`, `pressure` and
`contactGeometry`, which is why those targets are classed advisory and why `android-device-web`
cannot be folded into the matrix yet. Issue 1218 is the hand capture that closes it.

The one entry that is *inverted* rather than uncalibrated is `coalescing` on the Capacitor
WKWebView, which expects more than zero coalesced samples where Safari expects none — measured on
2026-08-23 with both runtimes driven at the same cadence on the same device. Do not widen that check
to cover both; widening it retires it in Safari, where it does real work.

## The preflight proves what it exercises, and nothing else

`--verify-android-input` used to drive the floor control and report a cadence in band, and nothing
more. It never rotated the device, so **a rotation fault passed every preflight check and failed
every landscape cell**. The 2026-08-23 recapture opened on a green rig and lost all eight
`android-device-web` landscape drawing cells before the first artifact was missed.

That flag now also drives a real rotation — the same stop, rotate, launch order a capture drives —
and reads the orientation the **page** reports rather than the one the device was asked for. It
restores the rotation settings it found. The passing path is verified on the SM-G990U1. The failing
path was observed once, by injecting the reversed order, and **does not reproduce on demand** — see
the rotation entry above; the check is verified against a synthetic mismatch in
`tools/perf/tests/android-rotation.test.mjs` rather than against a device fault anyone can summon.

The general rule outlives this particular hole: **a preflight proves the operations it performs.**
The iPad still has no rotation check, and every trap below is one that some cheap check passed
through.

Two distinct causes were behind it, and the first is the one that generalizes:

* **Something returns `user_rotation` to 0 across a relaunch, and it is not established what.** This
  was recorded as "`am force-stop` resets `user_rotation` to 0 on this Samsung under Android 16",
  and that specific claim does not reproduce: 8 trials on R5CRC3AVCXM kept it at 1 across
  force-stop, with Chrome stopped, with Chrome foregrounded first, and across the whole rotate →
  force-stop → launch sequence. The lost landscape cells were real and one fault injection did
  observe a LANDSCAPE request returning PORTRAIT with the setting reading 0 — but that read came
  after a relaunch, so it never isolated force-stop. Treat the ordering below as cheap insurance
  against an unexplained failure rather than as a fix for a known mechanism, and **verify a rotation
  by asking the page, not the setting**. The split transport used to rotate and then force-stop
  Chrome, which undid the rotation it had just asserted; the capture then aborted on the page
  disagreeing with the requested orientation and wrote nothing. `androidPageLaunchSteps` now orders
  it stop → rotate → launch, and `tools/perf/tests/split-capture.test.mjs` locks that order. Verify
  a rotation *after* whatever restarts the app, never before.
* **A control that is always in the DOM cannot be probed by presence.** `BrushMenu` renders its four
  options unconditionally and only sets `hidden`, so the bootstrap's `menuStillOpen()` check was
  true even when the menu was shut. Selecting a brush already closes the menu, so the close loop ran
  its full three toggles on a closed menu and the odd click left it open — over the paper. It failed
  only in landscape, where the flyout covers the canvas centre; portrait had been silently doing the
  same thing for as long as the check existed. `tools/CLAUDE.md` records the identical failure for
  `expandDrawer`: **probe visibility, not presence.**

The canvas-centre guard is what caught it, and it is the reason this cost cells rather than
producing plausible numbers — a menu over the paper otherwise yields a capture with frames and zero
pointer events. Do not weaken that assertion to get a run to complete.

## The device going to sleep

Android sleeps mid-campaign and locks. `npm run perf:preflight -- --wake-android` wakes it and sets
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

### The generator preserves from its own output

`preservedEvidence.from` is `data.json` — **the matrix generator's preservation source is its own
previous output.** So anything a regeneration drops from a preserved cell is dropped from the input
the *next* regeneration reads, and the loss compounds with nothing to announce it.

This is not hypothetical. A revision that moved the run-level `fidelity` verdict to a new key
destroyed every preserved historical verdict in one pass, and it was recoverable only because git
still had the file. If that had been committed, the provenance would have been gone for good.

Two rules follow:

* **Never drop or rename a field on a preserved run.** Derive what you need onto the aggregate,
  which is recomputed from the runs each time.
* **Check `git diff` on `data.json` after a regeneration**, not just the rendered pages. A field
  disappearing from preserved runs looks like a smaller diff, not like a failure.

`tools/perf/tests/performance-matrix.test.mjs` locks the fixpoint — it feeds a generated matrix back
in as the published report and requires the second pass to match — but a test cannot see a field you
never taught it about, so the diff is still worth reading.

### Rebuilding a handful of cells without recapturing the matrix

The matrix is incrementally rebuildable, and nothing about the three commands says so — this is the
loop. Every cell you do not recapture keeps its published number, because the manifest carries
`"preserved"` for it and the generator copies that forward.

```sh
# 1. capture the modes you want. --items= narrows a DIAGNOSTIC run; a run whose
#    output you intend to fold has to write the whole mode, so leave it off.
npm run perf:campaign -- --target=android-device-web \
  --modes=landscape-light,landscape-dark \
  --device-id=<serial> --url=http://<lan>:<preview>/ --probe-host=http://<lan>:<probe> \
  --output-root=perf-profiles/<campaign> --max-attempts=1

# 2. fold ONLY those modes into the manifest — paths derived, never retyped
npm run perf:campaign:sources -- --target=android-device-web \
  --output-root=perf-profiles/<campaign> --product-commit=$(git rev-parse HEAD) \
  --modes=landscape-light,landscape-dark \
  --manifest=scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json

# 3. regenerate; every untouched cell keeps its preserved evidence
npm run gen:performance-matrix -- scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

Two properties of step 2 decide how small an increment can be:

* **The unit is a mode, not a cell.** `perf:campaign:sources` rewrites a mode only when all four
  brushes *and* its action sweep are present in that output root and captured through the target's
  transport. This is deliberate — a partially captured mode is not a captured one — so a run
  narrowed with `--items=` folds nothing and leaves the matrix unchanged unless the mode's other
  artifacts are already sitting in the same `--output-root`. To move one brush you either recapture
  its whole mode or point the fold at a root that already holds the rest. Omit `--manifest=` to
  print what it *would* write: it names the missing items per mode, which is the cheapest way to
  find out before you have edited anything.
* **It is keyed off the artifacts on disk, not the ledger.** A cell that failed and wrote nothing is
  simply absent, so a partial run degrades to "that mode was not folded" rather than to a mode
  half-rewritten.

Run `npm run perf:campaign:status -- --target=<id> --output-root=<root>` between steps 1 and 2. It
decides completion from the runner's own artifact inspection rather than by counting ledger rows,
which is what makes it trustworthy after a resumed run.

Step 3 chains `check:matrix-staleness` in process, so a cell claiming to be a current measurement
whose product source has since changed fails the regenerate rather than being published.

Three things about `perf:campaign` that each cost a launch:

* **It needs device identity.** Without `--device-id=<hardware UDID>` (or `--capabilities-file=`)
  every cell fails instantly with `Pass --device-id= for a local iPad`, and 20 cells burn 60
  attempts in seconds.
* **The ledger remembers exhausted cells across runs** and will not retry them — the resume message
  is `3 attempts exhausted in earlier runs, not retried`. That is correct for a real device failure
  and wrong after a misconfigured launch. Read `ledger.tsv` before clearing it: if every row is
  `missing-or-invalid-json-exit-1` and no artifact was produced, the attempts recorded nothing and
  deleting the ledger costs nothing.
* **`android-device-web` drawing goes through the split input/measurement transport**, which
  requires `--probe-host=` — this host's LAN address, as the *device* sees it. A loopback address
  reaches the capture host's own browser and never the phone; the campaign rejects one up front, and
  asserts the probe host answers before the queue starts, because getting it wrong otherwise reads
  as a page that would not load. Start the host with `npm run perf:device:serve` first.

  The transport it replaced is the one ADR-0135 measured at **46.8 moves/s**, below the 100–170
  fidelity band. Re-probed on 2026-08-22 and it reproduces exactly: 46.8 moves/s, 0.44 moves per
  frame, with `pressure` and `contactGeometry` both zero, failing on `cadence` and
  `contactGeometry`. Learn what that costs before dismissing it as a harness detail — the capture
  then scores **11.5% lost frame time**, and the published `android-device-web` rows read 10–12%.
  Those rows are not a measurement of the product at all. At 0.44 moves per frame the app is barely
  being driven, and `lostFrameTimeShare` prices the gaps between sparse input as lost frames. A red
  cell produced this way looks exactly like a catastrophic regression and means nothing.

* **A capture that fails input fidelity is no longer counted complete.** The split runner writes its
  artifact and *then* fails the gate, so acceptance on "the artifact parses" banked exactly the
  cells the transport exists to stop producing. The ledger now distinguishes them: a
  `failed-input-fidelity` row spends an attempt but does not claim the artifact was missing — which
  matters, because "every row is `missing-or-invalid-json` and no artifact was produced" is the read
  that makes clearing a ledger safe.

`perf:ios:xcuitest:screen` drives Android too, despite the name.

## What a corpus can and cannot establish

Three of this campaign's own thresholds were argued from evidence that could not carry them, and all
three failed the same way. They are worth recognizing before setting the next one.

**A positive corpus is not a calibration.** Four healthy captures show what a good capture looks
like. They say nothing about what a bad one looks like, so they cannot establish a threshold that
has to tell the two apart. The Capacitor WKWebView's `coalescing` expectation was inverted to `> 0`
on exactly that evidence — and the negative control refuted it outright: an under-driven Android
Capacitor WebView at 47.81 contact moves/s also reports more than zero coalesced samples, so the
inverted check would have passed the very capture it exists to reject. **A check needs a known-bad
capture before it can decide anything.**

**A number quoted in prose is not provenance.** The WebKit commit gate's normalization reference was
taken from a passing rerun mentioned in an issue body. Three runs of the same fixed replay then
reported 8,135 / 9,685 / 13,843 ms — a 1.7x spread, larger than the 1.24x host signal the divisor
existed to correct for. A threshold's provenance has to be a run someone can point at, and a spread
wide enough to swallow the effect means the constant is not ready.

**An observation is not a mechanism.** A landscape capture came back portrait with `user_rotation`
reading 0, and that was written up as "`am force-stop` resets `user_rotation`". The read happened
after a subsequent relaunch, so it never isolated force-stop, and eight later trials could not
reproduce the reset in any arrangement. The failure was real; the cause was invented to explain it.
State what was observed, and keep a mitigation on the grounds that it is cheap rather than on the
grounds that it fixes a mechanism nobody has shown.

The shared shape: each one turned a *consistent* observation into a *general* claim. Consistency
across three samples of a single-frame statistic is exactly what chance produces — the probe's "one
extra beat on crayon in all three samples" inverted on the next run and vanished on the one after.

### A fault injection that moves the gate is not a test of the gate

Forcing `COMMIT_GATE_MS` to 0 to watch the commit gate fail proves the confirmed-breach path and
nothing else: with the budget at zero, *both* passes breach, so the acquittal and unconfirmed paths
are never exercised. A fault injection that changes the threshold changes which branch you are
testing. Say which branch a demonstration actually covered, and leave the others to unit tests
rather than implying the whole path was driven.

## Serialize the captures, but keep both devices alive

**Never capture Android and iOS at the same time.** Both campaigns drive input from this host, and
host contention changes input cadence — the variable that produced the false Android failures in the
first place. Chain them: finish one device's run, then start the other's.

**Keep both devices awake and reachable throughout anyway.** The idle device has to be ready when
its turn comes, and — more often — ready afterwards, when a result raises a question that only
another capture can answer. Tearing one down between phases turns a two-minute verification into a
restart.

`npm run perf:preflight -- --wake-android --hold-android-awake` holds both: it re-asserts Android's
stay-awake every 60 seconds and reports the moment either device goes away. It can only *observe*
the iPad — nothing on the host can hold an iPad awake, so set **Settings → Display & Brightness →
Auto-Lock → Never** on the device itself. An active XCUITest session keeps it awake during a
capture; the gaps are the risk.

## Keep the evidence before the scratch is gone

**Promote the campaign's representative captures into the tracked corpus** as a closing step:

```sh
npm run perf:evidence:keep -- --corpus=perf-profiles/campaign --campaign=<name>
```

`perf-profiles/` is gitignored, so everything a campaign captured disappears from a clean checkout.
That is what makes a metric correction cost device time rather than seconds: when the beat estimator
and the charge were corrected, every published cell kept the old number because re-scoring needs the
raw frames. ADR-0138 tracks one capture per target × brush so the next correction can be re-scored
against history with `perf:rescore`.

This step is not enforced anywhere, and the moment it gets skipped is the moment a campaign ends in
a hurry — which is every campaign.

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

## The in-page probe's own observer effect

Every real-screen capture runs with an injected probe that hooks pointer events,
`requestAnimationFrame` and performance marks on the drawing hot path — code the shipped app does
not run, executing inside the loop being measured. It was measured the same way, with
`npm run perf:device:probe-overhead`.

The awkward part is that the probe cannot score the arm that has no probe, and on this phone neither
platform-side clock answers for a browser target. Both were tried:

| Instrument                                 | On `com.android.chrome` while its page is drawn on                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `dumpsys gfxinfo … framestats`             | **0 frames rendered** — Chrome composites web content outside the view-system pipeline |
| `dumpsys SurfaceFlinger --latency <layer>` | all-zero rows on Android 16; only the refresh period is real                           |

That is a property of the target, not of the method: the same `gfxinfo` command against
`com.android.settings` over the same kind of gesture reports 298 frames. **`gfxinfo` is for the
native app, not for the browser target** — `docs/PROFILING-ANDROID.md` says so now.

So the common clock is a minimal `requestAnimationFrame` counter injected into *both* arms. It is
not free, but it is identical in both, so it cancels — the probe is the single variable. Same page,
same origin (so the persisted brush carries), same OS-driven gesture at identical device
coordinates, arms interleaved so device warming cannot be mistaken for the probe, three samples
each:

| Brush  | Control frames/s          | Probe frames/s            | Worst frame, control |      Worst frame, probe |
| ------ | ------------------------- | ------------------------- | -------------------: | ----------------------: |
| pen    | 90.09 (90.21/89.77/90.30) | 90.13 (90.09/90.01/90.29) |  16.8, 17.0, 25.1 ms |     25.0, 25.0, 25.0 ms |
| crayon | 89.98 (90.20/89.68/90.05) | 90.03 (89.71/90.21/90.16) |  25.0, 25.1, 25.0 ms | **33.4, 33.4, 33.4 ms** |

**In steady state it is unmeasurable.** The arms interleave inside each other's spread on both
brushes, and p50, p95 and p99 are identical to the millisecond in every sample. Record it beside the
Instruments finding and stop worrying about it.

**A tail asymmetry appeared once and did not reproduce.** In the run above, crayon's probe arm had a
single worst frame of 33.4 ms in all three samples against the control's 25.0 — four beats against
three. Two later runs disagree. One produced control maxima of 25.1 / 33.3 / 25.0 ms against probe
maxima of 33.3 / 16.8 / 16.8 ms, the opposite pattern. A third, taken with the brush primed and the
display holding a steady 60 Hz, showed no tail in either arm: 16.8–16.9 ms worst, both arms, every
sample, at 59.99 frames/s on both sides.

**All three are three samples of a single-frame statistic**, which is exactly the shape that looks
consistent by chance. Treat it as an unconfirmed lead, and do not quote the first run's internal
consistency as evidence for it. The steady-state result is unaffected.

Three limits worth stating rather than discovering later. The control still carries the counter, so
this bounds the probe against a trivial rAF loop and not against a wholly uninstrumented page — that
is inherent in needing a common clock. The gesture is a plain centre swipe rather than the
calibrated trusted-gesture path, so it is a fair comparison between arms and not a scoreable
capture. And **the brush has to be primed and verified before the first sample**: the arms share one
origin so the tool can compare like with like, which also means the control arm — which runs first —
draws with whatever the previous page persisted unless something sets it. Pass `--brush=` and the
run does that, and refuses to measure if the page never commits it.

## Do not edit the tools while a campaign is running

The rule below is about CPU. This one is about the source: **a campaign spawns a fresh Node process
per cell**, so it reads the capture tool from disk every time. Editing that tool mid-run changes
what the next cell executes, and the run silently splits into "cells captured before the edit" and
"cells captured after it".

On 2026-08-23 an import was added to `capture-local-frames.mjs` while a desktop sweep was in flight.
The call site landed and the import did not, so every drawing cell from that moment on died with
`ReferenceError: assertServedManifestResolves is not defined` while the action cells — a different
module, edited correctly — kept passing. The ledger showed 7 valid and 39 failed, which reads like a
device or browser problem and was neither.

It is recoverable, because a failed cell writes no artifact: the ledger is then all
`missing-or-invalid-json` with nothing on disk, which is the documented signature for a ledger that
is safe to clear (see *Recapturing matrix cells*). Confirm the artifact count matches the valid-row
count before clearing, then rerun — cells that already landed are skipped on their artifacts, not on
the ledger.

Make tool edits between targets, or on a branch the running campaign is not executing from.

### The long-lived servers are the mirror image: they never reload

A campaign re-reads the capture tool every cell. The **probe host does the opposite** — one
`perf:device:serve` process serves every split-transport cell, and it holds `lib/page-bootstrap.mjs`
in its module cache from the moment it started. Editing the injected page script therefore changes
nothing until that server is restarted, and the next run measures the old bootstrap while its log
and the source on disk both say otherwise.

That combination is worse than either half alone. The campaign picks the edit up, the probe host
does not, and the mismatch reads as "my fix did not work" — which invites a second, wrong fix on top
of a correct one.

Restart the host after any edit under `tools/perf/split-capture/lib/`, then prove the change is
actually being served rather than assuming it:

```sh
curl -s http://<lan>:<probe port>/__probe/bootstrap.js | grep <something your edit added>
```

The same applies to `perf:serve`: it serves whatever `web/build` held when vite started resolving,
so a rebuild wants a restart and the manifest check under *A build that is not the build you think*.

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

## A red cell describes the commit it was captured at, not the product

**Before treating a red cell as a product problem, rebuild the commit it was captured at and confirm
the failure still reproduces.** The matrix records that commit per mode (`drawingProductCommit` in
`sources.json`), and the product moves underneath it.

This is a different check from "compare against the previous run of the same cell" below, and it
catches something that one cannot: not a bad measurement, but a good measurement of a build nobody
runs any more.

Issue 1203 is the worked example. It reported physical-iPad crayon straddling the 50 ms paint-max
gate at 65, 59, 45 and 46 ms, from the 2026-08-22 `ipad-device-web` capture — which was taken at
`ae674d71` at 13:21. Four further commits to `web/src/lib/drawing/` landed before that day's work
merged at 22:20. Measured on the same rig the following night:

| Build                             |  n | paint max per sample       | worst |
| --------------------------------- | -: | -------------------------- | ----: |
| `ae674d71` — what the matrix held |  5 | 48, 42, 47, **77**, 45     |    77 |
| `main`                            |  7 | 47, 45, 47, 47, 45, 47, 47 |    47 |

The `main` arm was **eight** captures, not seven. One passed input fidelity and came back with an
estimated beat of 8 ms where the other seven sat at 17 ms, and it is excluded because those two
regimes are not comparable — the same drawing charged against an 8.3 ms beat instead of 16.7 ms
reads as a catastrophe. Its paint max was 42 ms, so excluding it does not flatter the result. State
an exclusion like this rather than presenting only the survivors, or an honest regime check is
indistinguishable from best-of selection.

The old commit reproduces the straddle exactly. `main` shows no excursion in seven consecutive
samples. The gate had already been fixed by the raster-queue extraction, and five candidate
implementations had been written to attack a cost that no longer existed.

### How to run the A/B without invalidating it

Checking the capture commit out in the active worktree gets you that commit's **capture driver and
scorer** as well as its product, and rebuilding overwrites the shared `web/build` underneath any
preview a running rig is serving. Either makes the comparison meaningless, and the second disrupts
whatever else is capturing.

So: build the historical product in an **isolated worktree on its own port**, drive both arms with
the **current** harness, and re-score both with the **current** scoring modules. Only the product
may differ between them.

```sh
git worktree add /tmp/ab-<commit> <commit>
cd /tmp/ab-<commit> && npm run perf:build
npm run perf:serve -- --port=<free port> --strict-port &
# drive from THIS checkout, pointing at that port
npm run perf:ios:xcuitest:screen --ignore-scripts -- --url=http://<lan>:<free port>/ --no-serve …
npm run perf:rescore -- --corpus=<both arms> --target=<the cell's target>
```

The historical arm is deliberately **not** this checkout's build, so it needs
`--allow-foreign-build`; that flag exists for exactly this case. The invariant being protected is
the *intended, independently verified* product commit — not current-worktree identity.

The A/B is two builds and about twenty minutes, against however long a candidate sweep takes.
`npm run check:matrix-staleness` answers the cheaper half of the question — whether any cell
currently claiming to be a measurement was taken from source that has since changed — without a
device, and `gen:performance-matrix` now runs it for you.

## Before believing a result

1. Fidelity verdict passed, and the input cadence is in band.
2. The served build is the one you intended, verified rather than assumed. A resolving manifest
   proves only that a server is self-consistent; it says nothing about *whose* build it is, and
   `build:cap` leaves a native static export in the same `web/build` a web build uses. Both are
   checked on every capture, including the `--url` path — but a deliberately historical build is not
   this checkout's, so identity there is asserted by you with `--allow-foreign-build`.
3. The committed brush matches the requested one.
4. At least three samples per cell — the within-config spread on a physical device is routinely
   comparable to the effect being measured.
5. The previous run of the same cell, for comparison. A single absolute number from this gate has
   been wrong more often than it has been right.
6. **The commit the cell was captured at**, if you are about to treat the number as a product
   problem. See above — a red cell can be a faithful measurement of a superseded build.
