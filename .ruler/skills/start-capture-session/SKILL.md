---
name: start-capture-session
description: Take over the physical iPad and Android capture rig at the start of a performance session — reserve and prove both devices, route around foreign host processes, and load the traps that produce plausible wrong numbers. Use before any physical-device profiling, targeted empirical review check, capture campaign, or performance matrix run, and when picking up devices a previous session was using.
---

# Start capture session

There is one iPad and one Android phone, so capture sessions run **in sequence, not in parallel**. A
user explicitly invoking this skill authorizes the session to reserve and use both physical devices;
do not refuse takeover because another device user might exist. Automatic skill loading alone is not
that authorization.

The reservation covers the devices, not every process related to capture. Another worktree's
preview, probe host, Appium server, or other listener remains that session's process. Leave it alone
and use the alternate ports the preflight resolves.

Takeover prepares the rig; it does not promise a campaign. Targeted physical-device checks are
supported while reviewing existing work with the `leave-pr-review` skill. If no finding needs a
capture, both devices verified and idle is a successful end state.

## In a fresh worktree, three things block before the preflight does

All three are gitignored, so a new worktree has none of them, and each fails in a way that does not
name itself. Copy the last two from the main checkout.

* **`node_modules`.** A worktree gets none. `pnpm install --frozen-lockfile` takes seconds; without
  it, `perf:serve` and every Playwright command die on a missing binary and the caller reports
  `http://localhost:4173/ did not become ready within 90000ms` — a timeout, with the real error
  scrolled off above it. Never `npm install` here (ADR-0119).
* **`ios/local.xcconfig`.** The preflight names this one correctly and blocks on it, which is the
  good case. It holds a `DEVELOPMENT_TEAM` line and nothing else.
* **`android/local.properties`.** Only a native Android build needs it, so the preflight passes
  without it and the failure waits until a Gradle task runs: `SDK location not found`. It names
  itself once it arrives, but it arrives minutes into a build rather than at the preflight.

## The iPad's automation prompt appears only while a launch is failing

XCTest asks the iPad to *Enter iPad Passcode for XCTest / Enable UI Automation* **at the moment a
WebDriverAgent session starts** — not at rest. So the device shows nothing wrong between runs, and a
human asked to check it will correctly report that there is no prompt.

That cost a session on 2026-08-24 twice over: once believing the iPad was unusable when a
five-second tap would have cleared it, and once with a human looking at an apparently clean device
while it was in exactly that state.

If `--verify-ios-launch` reports the automation denial, run it again with someone watching the
device — the prompt is on screen during that minute and nowhere else. The grant also expires on its
own, so a rig that worked yesterday can need the tap again today.

## A native capture over the probe host needs an ATS exception

A Capacitor WebView reaches the instrumented page through `server.url`, which is a plain `http://`
LAN address. iOS App Transport Security blocks that outright, and the failure is silent — the page
simply never loads, with nothing on the host saying why. `NSAllowsArbitraryLoads` in
`ios/App/App/Info.plist` clears it. Android needs `cleartext: true` in the Capacitor config, which
is Android-only and does nothing for iOS.

Both of those edits, and the `server.url` itself, are local capture scaffolding that must never be
committed — `server.url` names one machine's LAN address.

## Never commit what `cap sync` writes in a worktree

`cap sync` regenerates `android/capacitor.settings.gradle` and `ios/App/CapApp-SPM/Package.swift`
with paths **relative to the project it ran in**, and `cap:sync` additionally overwrites `web/build`
with the native static export — so a preview server started before it keeps serving a manifest whose
chunks now 404. A worktree sits several directories deeper than the main checkout, so every plugin
path is rewritten from `../node_modules/...` to `../../../../node_modules/...`. The files are
correct where they were generated and broken everywhere else, and nothing about the diff says so —
it reads as an ordinary regeneration.

Revert both after any native build from a worktree, and check `git status` before committing a
capture session's work.

## Take the rig over

```sh
npm run perf:preflight -- --wake-android --verify-android-input --verify-ios-launch
```

Run the full preflight and every command that touches either physical device outside the sandbox,
using the runner's escalation mechanism. A sandboxed `adb` cannot reach the host adb server and a
sandboxed `idevice_id` cannot open usbmuxd. If both enumerate nothing in a known sandbox, retry the
same full preflight outside it before diagnosing cables, trust, or authorization. If escalation is
unavailable but attachment was proved from a host shell, report exactly: **"devices are proven
attached; I cannot reach USB from my sandbox."**

Do not skip the two verifications on the grounds that the devices "were working a minute ago".
Everything else the preflight checks is host-side, and that is exactly how a blocked device reports
ready: enumeration, `ideviceinfo`, the tunnel, and every port check pass without ever launching an
app or delivering a touch.

| Flag                     | Proves                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `--wake-android`         | The phone is awake and stays awake. Writes stay-awake and a screen timeout, and does not undo them. |
| `--verify-android-input` | A real touch reaches a page at usable cadence, **and** the device and a loaded page both rotate     |
| `--verify-ios-launch`    | The iPad will accept a WebDriverAgent session **and turn** — about a minute                         |

`--verify-android-input` takes about a minute: roughly 20 s for the touch cadence and another 40 s
driving the page through landscape and back. Rotation is folded into it rather than given its own
flag on purpose — the promise it used to make, *a real touch reaches a page at usable cadence*, was
true and irrelevant for the half of the matrix that is landscape, and a rig must not be declarable
ready on a device that will not turn. It writes `user_rotation` and `accelerometer_rotation` and
restores whatever it found, including deleting a setting that was never written.

Fix whatever it blocks on before capturing anything. A blocked preflight exits non-zero and names
the cause; two of the likely ones need a human at the device and cannot be cleared from the host —
**Guided Access** (triple-click the side button, enter the passcode, End) and a locked phone.

**Read the fidelity verdict as two questions, not one.** `cadence` and `trustedTouch` failing means
the run was bad and a recapture may fix it. A check reported `(uncalibrated)` means the instrument
has no measured expectation for that runtime, and no number of recaptures will change it — the fix
is one known-bad capture of that runtime. Retrying an uncalibrated cell spends three attempts of
device time to reach the same answer, which is what every physical-iPad native cell currently does.

**A green preflight still does not mean every cell can be captured.** Rotation used to be the gap:
the preflight proved touch and never rotation, so a device that would not turn passed every flag and
then failed every landscape cell — half the matrix. Both devices are now driven through a real
rotation, and both are judged on the orientation the **page** reports rather than on the request
being accepted — those can disagree, and the disagreement is the failure. Neither device is proved
against anything the verification does not itself exercise.

The iPad's rotation is folded into `--verify-ios-launch` rather than given its own flag, because
that launch already pays for a WebDriverAgent build and already runs Safari. A failure names the
iPad's rotation lock, which is the cause a human can clear and the one a host-side check can never
see.

## Device ownership is not process ownership

The exclusive device reservation does not override the repo's concurrent-worktree rule. Never stop a
listener merely because it occupies a canonical port. Unknown ownership is foreign ownership.

* **Reuse the RemoteXPC tunnel** wherever it is running, no matter who started it. It is root-owned
  and its password prompt goes to a GUI dialog an unattended session cannot answer.
* **Reuse compatible Appium** only after its handshake proves it is ready; use the resolved WDA port
  so a borrowed server cannot collide with another session.
* **Restart a preview only when its resolved cwd belongs to this checkout.** The same `vite preview`
  command from another worktree is foreign. An unreadable cwd is foreign too.
* **Reuse a probe host only when preflight proves all of its identity:** this checkout owns it, its
  fixed upstream is the selected preview, the served build is this checkout's current build, and its
  plan is not finished or stale. Otherwise leave it running and use the resolved alternate port.

The preflight resolves preview and probe as a pair, then every other capture port. Record its device
ids and resolved ports in the handoff; pass both an explicit LAN `--url=` and `--probe-host=` to
captures instead of assuming 4173 or 4175.

## Read before capturing

Read [`docs/PROFILING-CAMPAIGNS.md`](../../../docs/PROFILING-CAMPAIGNS.md) completely. It is the
catalogue of ways a campaign produces **numbers that look fine and are wrong** — every trap in it
was earned, and none of them raise an error. Read
[`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md) as well before any on-device iPad
capture, and the `profiling` skill for what each `perf:*` command measures.

For a full cross-target snapshot rather than a single capture, continue with the
`capture-performance-matrix` skill once this preflight is green.

## While capturing

* **Never run anything heavy on the host.** The host drives the input; competing work changes input
  cadence, which is a measured variable rather than a detail.
* **Serialize captures**, but keep both devices awake — the idle one still has to be ready when its
  turn comes, and reachable afterwards for a follow-up question.
* **Read the fidelity verdict before the result.** A capture that parses is not a capture that can
  be scored. A cell that fails input fidelity must not be scored at all, however plausible its
  number looks. **Which check failed decides what the failure means**: `cadence` invalidates the
  number outright, while a check reported `(uncalibrated)` says the instrument has no measured
  expectation for that runtime — a gap closed by measuring the runtime, not by recapturing the cell.
  Every Android and desktop capture is uncalibrated on `coalescing`, `pressure` and
  `contactGeometry`, which is why those targets are classed advisory (ADR-0139).
* **Restart a long-lived server after editing what it serves.** The campaign re-reads the capture
  tool every cell, but `perf:device:serve` holds the injected page bootstrap in its module cache and
  `perf:serve` holds the build it started with. The two together read as "my fix did nothing", which
  invites a second wrong fix on top of a correct one. Prove the change is served, don't assume it.
* **Do not let a targeted capture rebuild under a managed preview.** npm runs `preperf:*` hooks by
  default, and several targeted capture hooks rebuild `web/build`, invalidating the manifest the
  running preview holds. Use the documented no-rebuild form when takeover already established the
  preview: `npm run <capture> --ignore-scripts -- --url=<resolved-lan-preview> ...`. If any command
  rebuilds anyway, restart only this session's preview and re-prove its manifest before touching a
  device.
* **Do not retry a gate that cannot pass.** `--max-attempts` defaults to 3, so a target whose
  fidelity failure is structural spends triple the device time reaching the same verdict. Pass
  `--max-attempts=1` once you know which failure you are looking at.
* **Do not tear the rig down when a capture ends.** A campaign is many captures, and clearing
  stay-awake between them is what put the phone to sleep mid-campaign once already.

## When a human is at the devices

`npm run perf:operator` is the guided session for the inputs only a person can give: re-arming the
iPad automation grant (the passcode prompt exists only during a WDA launch, and every attempt lands
in the tracked grant log under `perf-profiles/evidence/operator/`) and real-finger calibration
captures inside the installed Capacitor WebViews. It takes devices and ports from the preflight's
own resolution, launches the iPad app deterministically through `devicectl` — a hand capture once
recorded Safari under a WKWebView label because Safari happened to be foregrounded — and refuses an
artifact whose user agent contradicts the labelled runtime.

## Ending the session

Leave the rig up unless you are told otherwise — verified and idle is a valid handoff, and no
campaign needs to be started to make takeover count. What does **not** clean itself up is the state
`--wake-android` wrote: the phone keeps `stayon` and a 30-minute screen timeout until something
changes them back. Say so when you hand off, rather than leaving a phone that behaves oddly for
reasons nobody can trace.

End with a **rig-state block** — in the wrap-up reply, and in the handoff packet when one is being
written — one line per row, so the next session inherits facts instead of re-deriving them:

* checkout and commit the rig's preview/probe are serving;
* each device: id, and the verification verdict with its failed check when not green;
* resolved ports (preview, probe, Appium, WDA, and any others the preflight moved);
* per service: **owned by this session** (with pid) or **borrowed** (left alone, and whose);
* anything a human must clear (Guided Access, passcode, expired automation grant), stated as the
  exact action;
* Android wake state (`stayon` + timeout) and anything else deliberately left set.

The borrowed-vs-owned line is the one that prevents the next session stopping a foreign process; the
device ids and ports are what it passes as explicit `--url=`/`--probe-host=` instead of assuming
defaults. This block reports observations — never commit it, and never let it substitute for the
next session's own preflight: readiness is re-proven, not inherited.
