<!-- cspell:ignore adb framestats gfxinfo logcat perfetto pftrace -->

# Splotch — Performance Profiling

Splotch's performance evidence is programmatic and replayable. A Release build of the React Native
app can carry an in-app probe that writes one JSON line per contact cohort to the device log, and
that build can replay a committed touch trace with no finger on the screen. The same trace on the
same device before and after a change is the A/B. The platform's own instruments say what the device
did around it, and the Lighthouse gate covers the web export's page load.

The app lives in `experiments/native-architecture/` until the root move (#3163). Its
[`DEVELOPMENT.md`](../experiments/native-architecture/DEVELOPMENT.md) owns the probe's build
commands, its log fields and the replay launch commands; this page routes to them rather than
restating them.

## Which evidence answers what

| Evidence                                              | Answers                                                                                                                       | Where                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The in-app probe (`EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1`) | What one contact cohort cost: samples kept, flush and record time, input-to-submission latency, hand-off cadence, longest gap | `DEVELOPMENT.md` "Performance probe"; `src/drawing/perfProbe.native.ts`, `src/drawing/perfCohort.ts`       |
| A replay of a committed trace                         | The same cohort lines for a fixed input, plus a replay line whose `emissionLateness` says whether the replay kept time        | `DEVELOPMENT.md` "Replay"; `src/drawing/perfReplay.ts`, `perf/replay/`, `npm run gen:native-replay-traces` |
| `dumpsys gfxinfo … framestats` (Android)              | Where each view-system frame's time went between vsync and present                                                            | [below](#android-platform-instruments)                                                                     |
| Perfetto (Android)                                    | What the whole device was doing, including the scheduler: was the app slow, or descheduled?                                   | [below](#android-platform-instruments)                                                                     |
| `npm run test:lighthouse:ci`                          | First and largest contentful paint of the web export on a throttled phone and tablet, against a committed baseline            | the `audit-page-load` skill, `tools/page-load/`                                                            |
| The device-parity tools                               | Crash matrices, the Clear-drag footprint under stress, Appium tap playback time                                               | [`tools/device-parity/README.md`](../tools/device-parity/README.md)                                        |

The probe is compiled out of every build without the variable: `src/drawing/perfProbe.ts` is the
no-op the web export, Node and the type checker resolve. `tools/tests/native-perf-probe.test.mjs`,
`native-perf-cohort.test.mjs`, `native-replay-probe.test.mjs` and `native-replay-traces.test.mjs`
pin the probe's contract, its cohort maths, the replay driver's wiring and the committed traces.

## Running an experiment

1. **Name the number first.** Say which field of which trace would change the decision, and by how
   much, before building anything. A replay answers a question about one device; say which.
2. **Build both arms as probe Releases** with `EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD` set to each
   arm's commit, so every line carries the build it came from (`DEVELOPMENT.md`, "Performance
   probe"). A JS-only arm can reuse an existing Release probe build: `swap-js-bundle.mjs` rebuilds
   only the JavaScript into it (`tools/device-parity/README.md`, "Checking a JS-only change without
   a native build").
3. **Replay the same trace on the same device, several times per arm,** with the screen untouched
   until the replay line appears (`DEVELOPMENT.md`, "Replay").
4. **Discard a replay that did not keep time.** `emissionLateness` beyond a frame means the main
   thread held the replay back, and that replay's cohort lines measure the hold, not the change. On
   iOS, collect the log after the run rather than streaming it; a live stream alone pushes most iPad
   replays past a frame.
5. **Compare cohort fields, not impressions.** A person's finger is for what only a finger can do: a
   feel check, a physical-only property, or a new recording.

The two finger traces were converted from web input recordings that are not in the repository (the
recorder that made them was part of the retired harness). Recording a fresh finger session for
replay needs an app-side recorder that does not exist yet; the three generated traces regenerate
from their seed.

## Android platform instruments

The probe is the gate; these say what the platform did when the probe says something is wrong and
cannot say why. Local and probe builds install as `art.splotch.app.dev`.

```sh
adb -s <serial> shell dumpsys gfxinfo art.splotch.app.dev reset      # zero the counters first
# …replay or draw…
adb -s <serial> shell dumpsys gfxinfo art.splotch.app.dev framestats
```

The summary's named counters each point at a subsystem: `Slow UI thread` is the main thread,
`Slow issue draw commands` the render thread, `Slow bitmap uploads` texture upload, and
`High input latency` the input pipeline ahead of all of them. The `framestats` CSV between the
`---PROFILEDATA---` markers has one row per frame, in nanoseconds; read `FrameInterval` before
believing any per-frame number, because it is the refresh rate that frame was produced against. Rows
are frames the Android view system produced, and the ink layer's own surface need not map onto them
one to one, so `gfxinfo` supplements the probe rather than replacing it. ADR-0178's long-drawing
check is an example of what it can show.

```sh
adb -s <serial> shell perfetto -o /data/misc/perfetto-traces/run.pftrace \
  -t 10s -b 32mb gfx view sched input
adb -s <serial> pull /data/misc/perfetto-traces/run.pftrace
adb -s <serial> shell rm /data/misc/perfetto-traces/run.pftrace
```

Open the trace at [ui.perfetto.dev](https://ui.perfetto.dev), which runs in the browser and uploads
nothing. `sched` is the category that pays for itself: which thread was on which core, and what
preempted it.

## Device traps that still apply

* **Guided Access refuses every launch.** Splotch is a toddler app, and Guided Access is what a
  parent turns on to lock a child into it. Everything host-side still answers. Triple-click the side
  button, enter the passcode, and choose End.
* **A scheduled iPadOS update reboots the iPad into a locked screen** overnight, and a passcode
  cannot be entered from the host.
* **Android sleeps and locks mid-run.** Unlock the phone and leave it on the charger before an
  unattended run.
* **Heavy host work changes what the device measures.** A build, a test suite or another session's
  `check` competes with the log collection and the USB link. Sequence them: replays, then builds,
  then tests.
* **Build caches fill the host disk.** Every native build leaves DerivedData and Gradle output.
  Build into one named directory per experiment (`xcodebuild -derivedDataPath <dir>`), check `df -h`
  before each build, and delete only your own output, by relative path.
* **Name the device in every result, never its identifier.** `npm run check:device-identifiers`
  fails on a hardware UDID or a rig serial anywhere in the tracked tree.

## Retired

The SvelteKit and Capacitor performance harness was retired by #3160 (ADR-0182): the `tools/perf`
capture targets, campaigns and analyzers, the `/dev/engine` perf targets, the WebKit commit gates,
and the deployment-target performance matrix. It measured engines that no longer ship. Its records
stay as history: the frozen matrix in `scrapbook/performance/`, the evidence corpus in
`perf-profiles/evidence/`, the investigations in `docs/scratchpad/perf/`, and the ADRs that set its
gates.
