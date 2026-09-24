# Epic 2210 person-present session — runbook

Every task on epic #2210 that needs a person at the devices, run by one command:

```sh
npm run perf:session:person
```

It resumes where it stopped (state in `perf-profiles/person-session/<id>/state.json`), so the same
command starts visit 1, recovers from a failed step, and starts visit 2. `--plan` prints the steps
and minutes; `--redo=<step>` runs a step again and keeps its PASS captures; `--skip=<step>` records
a step as skipped; `--teardown` stops every server the session started.

The runner never posts anything. Each step writes a draft comment to
`perf-profiles/person-session/<id>/drafts/<issue>-<name>.md` and prints the
`gh issue comment <n> -R KyleMit/Splotch --body-file <path>` line to post it after you read it.

## Time

| Visit                   | Your time   | Runs on its own | Devices                                                 |
| ----------------------- | ----------- | --------------- | ------------------------------------------------------- |
| 1                       | ~32 min     | ~80 min after   | iPad ~27 min, phone ~5 min                              |
| 2 (any time after tail) | ~17 min     | ~25 min update  | iPad ~7 min, notched iPhone ~10 min (during the update) |
| **Total**               | **~49 min** |                 |                                                         |

You can leave as soon as the phone overlay check says PASS. The phone A/B and the four iPad action
sweeps then run one device at a time, and the runner stops every server it started when they end.

## Pre-sit checklist

* No other capture is running: `pgrep -fl 'run-campaign|run-operator|run-person-session'` prints
  nothing.
* Run from the prepared checkout named in *Rig state at handoff* below, which holds the clean perf
  build the bring-up checks (`web/build` stamped with that checkout's HEAD, `dirty: false`).
* iPad: charged, unlocked, **Auto-Lock Never**, rotation lock **off**, Safari on one tab, still on
  **iPadOS 26.5**. Do not install the update until visit 2.
* Phone: unlocked on its charger. Leave Play Protect as it is.
* Notched iPhone and its cable, if you have one (visit 2, optional).
* Mac volume up: every capture start and stop is spoken (`say`), and so is each PASS or REDO.

## Visit 1

| Step                  | Minutes | You do                                                                                                                                                                                                | Done looks like                                                                            |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bring-up`            | 3       | Unlock both devices. Watch the iPad if it says it is launching WebDriverAgent: enter the passcode if asked.                                                                                           | iPad on 26.5; preview, probe host, Appium, WebDriverAgent answer; build = checkout HEAD    |
| `ipad-portrait`       | 12      | Hold the iPad portrait. Hands off for the 2 driven captures; draw on "Draw now" until "Stop" for the 4 finger captures.                                                                               | 6 × PASS: pen driven + finger, Magic driven + 3 fresh-load finger captures                 |
| `ipad-landscape`      | 5       | Turn to landscape. Erase the pre-painted page in long passes (never scrub one spot); then a pen scribble. Turn back to portrait.                                                                      | 3 × PASS, each eraser page fill verified                                                   |
| `ipad-native`         | 5       | Hold portrait. The runner opens the installed app; draw from "Draw now" until "Stop".                                                                                                                 | 2 × PASS from the bundled page                                                             |
| `ipad-secure-origin`  | 2       | Answer y to start the two HTTPS fronts; say what the iPad shows for each page.                                                                                                                        | The constraint probe shows "This Connection Is Not Private"; the leaf loads Splotch        |
| `phone-overlay`       | 5       | Phone: Settings → Accessibility → Installed apps → NU Navigation Bar → off, wait 3 s, on (or leave off). If two windows survive: Settings → Apps → NU Navigation Bar → Force stop, then open it once. | PASS printed and spoken. **You can leave.**                                                |
| `phone-ab`            | ~25     | Nothing.                                                                                                                                                                                              | 9 captures (3 rounds × 3 arms), each 160/160 pointerdowns, fidelity PASS, 120 Hz           |
| `ipad-secure-actions` | ~55     | Nothing.                                                                                                                                                                                              | 4 sweeps, none blocked-coverage, every AI-waiting sample a secure context; servers stopped |

What each finger capture wants: 30 s of long, continuous scribbles across the whole page with one
finger, lifting only to start a new stroke. A REDO names what to change (too little finger-down
time, a stroke too fast for the 60 Hz regime, an untrusted touch) and offers the redo at once.

The phone overlay check on its own, any time:

```sh
npm run perf:session:person -- --check=overlay
```

It parses `adb shell dumpsys input` and prints `PASS`/`FAIL` with the number of `USE_OPACITY`
`nu.nav.bar` windows and what their stack sums to against Android's 0.8 obscuring limit.

## Visit 2 — the iPadOS update, last

Nothing from visit 1 can run after this starts; the runner refuses it.

| Step                | Minutes      | You do                                                                                                    | Done looks like                                                |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ipad-update`       | 3 (+~25)     | iPad: Settings → General → Software Update → iPadOS 26.6 → Update Now; passcode.                          | Update running                                                 |
| `iphone-inset`      | 10, optional | Plug in the iPhone; answer six look-and-tap checks (portrait, both landscapes, lower-edge taps, Privacy). | Every check answered; screenshots taken on the phone           |
| `ipad-commit-check` | 4            | When the runner says the iPad is on 26.6: unlock, tap Trust, open Safari to one tab.                      | `perf:ios:webkit:commit` prints PASS, BREACH, or NOT EVALUATED |

The commit check needs `ios_webkit_debug_proxy` to list Safari pages. If it lists the iPad and no
pages on 26.6, the #2237 draft says so and names the contingency in that issue (repoint
`webkit-inspector.mjs` at pymobiledevice3's `webinspector cdp`).

## Where results go

| Draft                   | Issue | Contents                                                                         |
| ----------------------- | ----- | -------------------------------------------------------------------------------- |
| `2235-paired.md`        | #2235 | Driven vs finger, pen and Magic, one session and probe host; driven − finger gap |
| `2232-first-load.md`    | #2232 | Per Magic finger capture: worst in-contact gap, onset, share without it          |
| `2231-eraser.md`        | #2231 | Both landscape eraser finger captures, plus the landscape-dark pen (#2233 input) |
| `2236-native-finger.md` | #2236 | Bundled-app pen and Magic finger captures, with the installed build's commit     |
| `2211-secure-sweeps.md` | #2211 | The four HTTPS action sweeps and the human-present procedure that produced them  |
| `2229-ab.md`            | #2229 | The A/B table: e5142fab, 3928cd88, 3928cd88 with Reduce Motion, n = 3 each       |
| `2237-commit-check.md`  | #2237 | The 26.6 verdict and the release-notes figures                                   |
| `2249-iphone.md`        | #2249 | The notched-iPhone checklist                                                     |

Rulings stay yours: whether ADR-0174 stands (#2235, #2231), the #2232 disposition (`needs-adr`), and
which follow-ups to file. After posting, keep the captures with `perf:evidence:keep` (each draft
names its session directory) and update the #2210 ledger.

## How the tasks map to the harness

* iPad Safari finger captures: `perf:device:hand --open=safari --speak`. Safari is opened at the
  run's nonce URL with `devicectl --payload-url`, so the page proves its identity without anyone
  typing a URL.
* iPad Safari driven captures: `perf:device:frames --platform=ios --wda-url=` through the same probe
  host, which is what makes #2235's pair a pair.
* Bundled app finger captures: `perf:ios:bundled:frames --hand-input --speak`. WebDriverAgent stays
  attached; the artifact records that.
* Phone A/B: each historical build is served from its own worktree under `~/.splotch-rig/ab-2229/`
  and driven by this checkout's harness with `perf:device:frames --allow-foreign-build`, so only the
  product differs (`docs/PROFILING-CAMPAIGNS.md`, "How to run the A/B without invalidating it"). The
  Reduce Motion arm uses `--reduce-motion=reduce`, which seeds the preference through the probe plan
  and reads the page's own answer back. Every arm then compares the page's trusted pointerdowns with
  the swipes sent (`dispatchedStrokes`).
* Secure-origin sweeps: `perf:ios:secure-origin serve`, started by your run of this command after
  you confirm, then `perf:campaign --target=ipad-device-web --items=actions --url=https://…` with
  `NODE_EXTRA_CA_CERTS`. Starting the command yourself is the approval the classifier cannot give an
  unattended session (#2211).
* `perf:device:hand` still runs the build guard unconditionally, so it cannot capture the floor
  control. No task here needs the floor, so that follow-up stays drafted on #2210.

## Rig state at handoff

Filled in by the preparing session; re-proven by `bring-up`, never inherited.
