# iPad memory: does RN reach a ceiling in a long dense session?

Lane: ipad-memory, 2026-11-11, Claude. Device: the iPad (iPad Pro 12.9-inch 5th gen, iPadOS 26.5).
Arms: RN best v2 `art.splotch.app.dev.best` (`claude/best-rn` @ `e703b8b79`, probe Release; its
probe lines on the iPad carry `"build":"e703b8b79"`) and shipping best
`art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff6`). Both were installed before
this lane. Tools, raw samples and key frames are in `ipad-memory/` in the campaign scratch folder.

## Pre-registered (written 2026-11-11 02:35 EST, before either counted run)

**Session, the same script for both arms, one run per arm, RN first**
(`ipad-memory/bin/session.mjs`, driven by `run.zsh`). It mirrors the Galaxy's session in
`rn-memory-bones.md`:

| Step        | Galaxy (`rn-memory/bin/gen.py`)                                 | iPad (this lane)                                                                                                                                    |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start       | Cold launch, Crayon, Clear                                      | Cold launch (`devicectl … --terminate-existing`), WDA foreground, Crayon, Purple, Clear, 30 s of blank paper                                        |
| Drawing     | 2 s zigzag strokes (legs 150–600 px) at 2,000 px/s, 0.5 s lifts | 2 s zigzag strokes (legs 144–576 pt) at 1,500 pt/s, the same share of the paper diagonal per second; fixed seed, so both arms get identical strokes |
| Undo        | ×3, 400 ms apart, every 60 s                                    | Same                                                                                                                                                |
| Phase A / B | 0–20 min one picture; Clears at 20.5, 24.5, 28.5 min            | Same                                                                                                                                                |
| End         | Final Clear at 32 min, 60 s idle, HOME + forced GC, resume      | Final Clear at 32 min, 60 s idle, HOME 30 s, resume 30 s (iOS has no forced-GC signal), then Pen, Purple, cleared page                              |

Deviations forced by the harness: touches go through WebDriverAgent (XCTest), which spends ~25–30 ms
per pointer action before a gesture plays, so the finger rests ≥0.5 s between strokes without an
explicit wait, and fewer strokes fit in 32 minutes than the Galaxy's 718 (the count is reported).
Strokes use 96 ms waypoints; XCTest interpolates touches between them at the display rate.

**Metric.** `phys_footprint` (the number Jetsam acts on, GPU memory included) from
`com.apple.instruments.server.services.sysmontap` every 10 s over one persistent DVT connection
(`bin/sampler.py`), no Instruments. RN: the `Splotch` process whose pid `devicectl` returned at
launch. Shipping: `App` (pid from `devicectl`) and every `com.apple.WebKit.*` process in the same
coalition, each reported, plus their sum. MB = MiB.

**Watching for memory warnings and kills.** (1) DVT `mobilenotifications` (memory-level and
app-state events, on the sampler's connection); (2) the live unified log through `syslog_relay`,
filtered as it streams (`bin/logwatch.py`: memorystatus, Jetsam, memory warning or pressure,
EXC_RESOURCE, per-process limit, crash and termination lines for both apps); (3) RN's probe counts
`AppState` memory warnings per stroke; (4) the crash-report listing after each run (JetsamEvent).

**Readings** (as the Galaxy's, plus the last-10-minute slope the brief asks for). *Blank* = mean of
the samples in the 30 s before the first stroke. *Peak* = highest sample. *Clear drop* = the first
sample ≥30 s after a Clear minus the last one before it. *Floors* = those post-Clear samples at
about 21, 25 and 29 min, and their slope. *End* = the sample after the final Clear plus 60 s idle;
*G* = End − Blank. *S10* = least-squares slope over drawing minutes 22–32; *S15* over 17–32; *SA*
over 10–20 (one growing picture). Slopes in MB/min.

**Classes, per process.** *Ceiling* if S10 ≤ max(1.0, shipping's) and the floors rise ≤ 1.0 MB/min.
*Growth* if S10 > 2.0 or the floors rise > 2.0 MB/min. *Creep* in between. *Climbs with the picture*
if SA > max(1.5, shipping's SA).

**Floor-iPad projection.** The smallest supported iPad (iPad 5th gen, iPadOS 16.4 floor) has 2 GB
and a 2048×1536 screen against this iPad's 2732×2048: raster ratio r = 0.562. Two projections:
*scaled* = Blank + r × (Peak − Blank), which assumes everything above blank paper is raster
(optimistic: on the Galaxy most of RN's residual was Hermes and native heap); *unscaled* = Peak (an
upper bound: nothing shrinks). Threshold: Jetsam's foreground limit on 2 GB devices, ~1.35–1.4 GB
(crowd-sourced, moderate–low confidence, `rn-memory-bones.md`).

**Numbers that would change the decision:**

1. RN in *Growth* (still growing over the last 10 minutes, or post-Clear floors rising > 2 MB/min).
2. RN's scaled floor projection ≥ 1.08 GB (within 20% of ~1.35 GB). An unscaled peak ≥ 1.08 GB is
   reported as "not excluded".
3. Any memory warning, Jetsam kill or memory EXC_RESOURCE for either arm during its run.

Shipping is the comparison: the same rules are applied to each of its processes.

Added 02:42, still before either counted run: after each run the unified log for the run window is
collected (`syslog collect`), filtered on the Mac and deleted, because `syslog_relay` truncates
lines at ~1 KB and so cuts the probe's per-stroke `memoryWarnings` and `gc` fields. Three pilots (RN
twice, shipping once; the schedule compressed 16×, 2 minutes of drawing) validated the driver before
this. They are not counted. Pilot 1 found that 32 ms waypoints cost 2.4 s of WDA time per stroke,
which led to the 96 ms waypoints above. The RN probe showed touch delivery unchanged: packet gap p50
10.0 ms vs 10.1 ms, ~246 points per 2.1 s stroke.

## Sampler proof

| Check                             | How                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing staged on the iPad        | `AmountDataAvailable` (lockdown `com.apple.disk_usage`) around a control minute with no sampler, then a test minute with the sampler and the live-log watch running (02:21:47 → 02:22:47 → 02:23:50) | Control minute +3 MiB, test minute −1 MiB. An Instruments trace stages GBs, so the sampler and the log stream write nothing on the iPad. Each run also logs free space before and after                                                                     |
| Cadence                           | Host timestamps of successive samples                                                                                                                                                                | 9.90 s apart (sysmontap `sampleInterval` 10 s). Every process is in every row: `procAge` is requested, because sysmontap otherwise sends only processes whose values changed                                                                                |
| RN process                        | The pid `devicectl … process launch` returned vs the sampled `Splotch` rows                                                                                                                          | Same pid, in its own coalition. Two other `Splotch` processes run in the background on the iPad (the frozen `.dev` probe and the audio spike, other lanes' apps, left alone), each with its own pid and coalition and a flat footprint; they are never read |
| Shipping processes                | sysmon `coalitionID` vs RunningBoard's own `xpcservice<com.apple.WebKit.X([app<art.splotch.app.baseline.best>:<pid>])>` lines                                                                        | Both agree: App plus its Networking, WebContent and GPU processes share one coalition (shipping pilot: App 760 → 761, 762, 763). The other shipping copy in the background (`.baseline.main`, 489) has its own trio in another coalition                    |
| Metric                            | sysmontap `physFootprint` is the task's `phys_footprint`, the value memorystatus (Jetsam) compares with the per-process limit                                                                        | RunningBoard set these limits on this iPad (pilot logs): RN app **5,120 MB**; shipping WebContent 5,120 MB (hard), GPU 300 MB (soft), Networking 840 MB (soft)                                                                                              |
| Memory warnings and kills visible | DVT `mobilenotifications` on the sampler's connection; the live log filtered as it streams (~3,200 lines/s, heartbeat each minute); RN's probe counts `AppState` memory warnings per stroke          | The DVT stream reports `applicationStateNotification` for every app change (launch, Suspended at HOME, Running on resume) and `memoryLevelNotification` events. The live log carries kernel `memorystatus` lines and RunningBoard's limit lines             |

## Runs

| Arm      | Run      | Time (EST)  | Strokes | Mean stroke cycle (WDA time) | Paper inked at 10 / 19.9 / 30 min | Focus lost | Process(es) alive in every sample |
| -------- | -------- | ----------- | ------- | ---------------------------- | --------------------------------- | ---------- | --------------------------------- |
| RN       | `rn-1`   | 02:39–03:14 | 591     | 3.26 s (1.08 s)              | 87% / 99% / 28% (after Clears)    | 0          | yes, 213 of 213                   |
| Shipping | `ship-1` | 03:15–03:50 | 592     | 3.25 s (1.07 s)              | 87% / 99% / 26%                   | 0          | yes, 212 of 212, all four         |

The two arms got the same strokes from the same seed (the ink fractions match to 0.2 points). All
591 RN strokes arrived as probe cohorts (`e703b8b79`; packet gap p50 11.4 ms, median 252 points per
stroke). The Galaxy session drew 718 strokes at a 2.5 s cycle; this one drew 82% of that.

## Memory by phase

`phys_footprint`, MB (MiB). Minutes from the first stroke. Slopes in MB/min. *Clear drop* = 30 s
after the Clear minus just before it.

| Arm, process         | Launch | Blank | Peak (min)     | At 20 min | Clear drops 20.5 / 24.5 / 28.5 | Floors 21 / 25 / 29 (slope) | Draw end | End (idle 60 s) | G    | HOME 30 s | Resumed 30 s | S10   | S15   | SA    |
| -------------------- | ------ | ----- | -------------- | --------- | ------------------------------ | --------------------------- | -------- | --------------- | ---- | --------- | ------------ | ----- | ----- | ----- |
| RN, app              | 138    | 156   | **721** (24.6) | 691       | +5 / −10 / +5                  | 696 / 697 / 693 (−0.34)     | 691      | 541             | +385 | 521       | 541          | −1.63 | −0.29 | +3.28 |
| Shipping, App        | 19     | 20    | 21             | 20        | 0 / 0 / 0                      | 20 / 20 / 20 (0.00)         | 20       | 20              | 0    | 20        | 20           | 0.00  | 0.00  | 0.00  |
| Shipping, WebContent | 218    | 158   | **416** (28.6) | 285       | +78 / +39 / −4                 | 363 / 341 / 320 (−5.32)     | 288      | 252             | +95  | 168       | 245          | −2.37 | −0.80 | +2.65 |
| Shipping, GPU        | 48     | 15    | 71 (28.6)      | 34        | +19 / +19 / −5                 | 54 / 53 / 32 (−2.59)        | 37       | 51              | +36  | 35        | 50           | −0.02 | +0.08 | −0.15 |
| Shipping, Networking | 7      | 5     | 7              | 5         | 0 / 0 / 0                      | 5 / 5 / 5 (0.00)            | 5        | 5               | 0    | 5         | 5            | 0.00  | 0.00  | 0.00  |
| Shipping, total      | 292    | 198   | **512** (28.6) | 345       | +97 / +58 / −8                 | 442 / 419 / 377 (−7.91)     | 350      | 328             | +131 | 228       | 322          | −2.39 | −0.73 | +2.50 |

**RN's shape** (slopes outside the pre-registration, for the shape only): +47 MB/min over minutes
0–5, +21 over 5–12.5, then **0.0 from 12.5 to 32** (−0.01 over 12.5–20, −0.18 over 20.5–32). The
climb ends when the paper is full (99% inked by 19.9 min). Clears made while drawing carries on
return nothing. The final Clear plus 60 s of idle returns 150 MB.

| RN, MB                              | Blank | 1 min | 5 min | 10 min | 15 min | 20 min | Draw end | Final Clear + 10 s | Idle 60 s | HOME 30 s |
| ----------------------------------- | ----- | ----- | ----- | ------ | ------ | ------ | -------- | ------------------ | --------- | --------- |
| Footprint                           | 156   | 361   | 530   | 634    | 694    | 699    | 684      | 561                | 541       | 521       |
| malloc (`memAnon`)                  | 94    | 213   | 301   | 323    | 340    | 340    | 344      | 291                | 272       | 251       |
| Other (Metal/IOSurface and similar) | 63    | 148   | 229   | 312    | 354    | 359    | 340      | 269                | 269       | 269       |

Half of RN's high-water mark is graphics memory that nothing releases on iOS (+206 MB on blank paper
after the session): v2's Ganesh purges are Android-only, so the iPad keeps Skia's Metal resources.
The other half is malloc and the Hermes heap (+178 MB), the part the Galaxy's settle run classed as
bones.

## Classes (pre-registered rules)

| Arm, process         | S10 vs bar (≤ 1.0 ceiling, > 2.0 growth) | Floors slope | Class       | Climbs with the picture (SA > max(1.5, shipping's)) |
| -------------------- | ---------------------------------------- | ------------ | ----------- | --------------------------------------------------- |
| RN, app              | −1.63                                    | −0.34        | **Ceiling** | Yes, +3.28 > 2.65, but only until the paper is full |
| Shipping, WebContent | −2.37                                    | −5.32        | **Ceiling** | Yes, +2.65 > 1.5                                    |
| Shipping, GPU        | −0.02                                    | −2.59        | Ceiling     | No                                                  |
| Shipping, total      | −2.39                                    | −7.91        | Ceiling     | Yes, +2.50                                          |

Against shipping at the same moments: RN's peak is 721 vs 512 MB (1.4×), and after the session RN
idles at 541 vs 328 MB. Shipping splits its memory over processes Jetsam limits separately; its
largest single process peaks at 416 MB.

## Memory warnings and kills: none in either arm

| Source                                                         | RN                                                                                                                                             | Shipping                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| DVT app-state events                                           | Running from launch until HOME (Suspended), Running on resume                                                                                  | Same, for App                                                                                                                                   |
| Kernel `memorystatus` kills, EXC_RESOURCE, per-process limit   | 0                                                                                                                                              | 0                                                                                                                                               |
| Memory-warning lines (live log 111 M lines; collected archive) | 0                                                                                                                                              | 0. WebKit logged "Memory pressure relief" twice, 17 s after HOME: its own cleanup on suspension (WebContent 252 → 168 MB), not a system warning |
| RN probe `memoryWarnings`                                      | 0 in the longest-gap window of all 591 strokes (os_log truncates each probe line at ~1 KB, which cuts the per-stroke total)                    | –                                                                                                                                               |
| Crash reports after the run                                    | No JetsamEvent or crash report from today (newest JetsamEvent 2026-10-20)                                                                      | Same                                                                                                                                            |
| DVT `memoryLevelNotification`                                  | System-wide (pid −1) code 3 at the HOME press, and twice at 2.7 min. Those coincided with the kernel freezing the suspended pilot shipping app | Code 3 at the HOME press only. It came at HOME in all five runs (pilots included), so it is a system event, not one aimed at either app         |

The iPad (8 GB) ran with 25–104 MB free and ~0.5 GB compressed throughout both runs, its usual state
with other lanes' apps suspended in the background.

## Floor-iPad projection

Raster ratio r = 0.562 (2048×1536 vs 2732×2048). Threshold: ~1.35 GB (≈ 1,380 MB) crowd-sourced for
2 GB devices. A cross-check from this iPad: RunningBoard gave the app 5,120 MB of 8 GB (62.5%),
which on 2 GB would be ~1,280 MB.

| Process (peak)           | Scaled = Blank + r × (Peak − Blank) | Unscaled (Peak) | malloc unscaled, rest scaled (added after the run) | Share of ~1,380 MB (of ~1,280 MB)   |
| ------------------------ | ----------------------------------- | --------------- | -------------------------------------------------- | ----------------------------------- |
| **RN app**               | **474**                             | **721**         | 602                                                | 34–52% (37–56%)                     |
| Shipping WebContent      | 303                                 | 416             | –                                                  | 22–30%                              |
| Shipping GPU             | 46                                  | 71              | –                                                  | under this iPad's 300 MB soft limit |
| Shipping total (4 procs) | 374                                 | 512             | –                                                  | not one Jetsam budget               |

The decision bar (scaled ≥ 1.08 GB, or unscaled ≥ 1.08 GB as "not excluded") is not reached: even
unscaled, RN's peak is ~660 MB under the bar. This agrees with `rn-memory-bones.md`'s estimate of
~0.7 GB. Not covered: the floor iPad's A9 GPU and iPadOS 16 may allocate Metal memory differently,
and the shipping WebContent and GPU limits on a 2 GB iPad are unknown.

## Verdict

* **RN best v2 on the iPad: ceiling, not growth.** It climbs while the paper fills (about 12 minutes
  of dense Crayon), then sits flat at ~690–720 MB for the remaining 20 minutes, through 3 Clears and
  32 Undo bursts. No warning, no kill.
* **Shipping best: ceiling too**, lower and spread over processes (peak 512 MB in total, 416 MB in
  WebContent).
* **Crash risk on the floor iPad: low for both.** RN's projected peak is 474–721 MB against a
  ~1.3–1.4 GB limit.
* **Cost (minor, RN):** a high-water mark that a Clear does not return. RN idles at 541 MB with a
  blank page after the session, against shipping's 328. The GPU half (~270 MB of Metal resources)
  has a plausible untried fix: v2's idle purge ported to the Metal context. The malloc and Hermes
  half matches the Galaxy's "bones" reading.
* **None of the three pre-registered decision-changers occurred.**

## Notes

* The iPad's free space fell 237 MB during the RN run and 85 MB during the shipping run. Neither
  app's data container explains it (RN 46.7 MB in total, 12 MB written today, launch snapshots;
  shipping 35.3 MB, 13 MB). Nor do the tools (−1 MiB in the test minute; each log collect moved it
  by ≤ 0.2 MB) or the kernel freezer (~30 MB). Unexplained, and not memory.
* Tools:
  `ipad-memory/bin/{sampler.py, logwatch.py, session.mjs, run.zsh, table.py, report.py, md.py}` in
  the campaign scratch folder, which also keeps `keep/ipad-memory-series.csv` (13 KB, every sample
  per process), the readings and events JSON, and the 19.9-minute and draw-end frames of both arms.
  Raw samples, logs and the 325 MB and 284 MB log archives were deleted after scoring.
* Device state: both best apps left on Pen, Purple, a cleared page, in landscape (as found). Sound
  was never touched. RN best is suspended in the background; shipping best is in front. The store
  app was never launched or touched. No Instruments, no reboot. This lane's WebDriverAgent was
  stopped and `dev-ipad.lock` released at 03:54.
