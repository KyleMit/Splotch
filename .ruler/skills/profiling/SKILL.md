---
name: profiling
description: Measure the React Native app's drawing performance with replayable evidence — the in-app perf probe, committed replay traces, and Android's platform instruments. Use when measuring drawing performance, investigating jank or a slow interaction, verifying a perf change, or checking for regressions.
---

# Splotch — Performance Profiling

The React Native app's performance evidence is programmatic and replayable: a probe Release build
writes one JSON line per contact cohort to the device log, and the same build replays a committed
touch trace with no finger on the screen. The same trace on the same device before and after a
change is the A/B.

**[`docs/PROFILING.md`](../../../docs/PROFILING.md)** is the reference:

| Section                           | Answers                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| **Which evidence answers what**   | Which instrument to reach for: the probe, a replay, `gfxinfo`, Perfetto, or Lighthouse |
| **Running an experiment**         | The A/B procedure, and which replays to discard                                        |
| **Android platform instruments**  | The `gfxinfo framestats` and Perfetto commands, and what each can and cannot see       |
| **Device traps that still apply** | Guided Access, overnight updates, sleep, host load, a full disk, device identifiers    |

The probe's build commands, its log fields and the replay launch commands live in
[`experiments/native-architecture/DEVELOPMENT.md`](../../../experiments/native-architecture/DEVELOPMENT.md)
("Performance probe" and "Replay"). Read them before building a probe Release.

Two things to check before drawing a conclusion:

* **Name the number first.** Say which cohort field of which trace would change the decision before
  building anything, and give each hypothesis at most two attempts.
* **A replay that ran late measures the hold, not the change.** Discard any replay whose
  `emissionLateness` exceeds a frame, and on iOS collect the log after the run rather than streaming
  it.

For page-load / Core Web Vitals work on the web export, use `audit-page-load` instead.
