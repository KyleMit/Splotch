---
name: profiling
description: Capture and read an automated performance profile of the drawing app (web, Android, iOS). Use when measuring drawing/canvas performance, investigating jank or a slow interaction, verifying a perf change, or checking for regressions over time. Covers the `npm run perf:*` harness, how to read report.md/summary.json, and the bottleneck decision guide.
---

# Splotch — Performance Profiling

The harness (`tools/perf/`, ADR-0032) drives a deterministic "toddler session" through the app while
recording a profile, then writes a machine-readable report. One command per platform; the analyzer
is pure and re-runnable on any saved trace.

**[`docs/PROFILING.md`](../../../docs/PROFILING.md)** is the reference:

| Section                                 | Answers                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Commands**                            | Which `perf:*` command profiles what, under which throttle, and what it captures                         |
| **Which undo run to reach for**         | `perf:undo` vs `perf:undo:webkit` — they answer different questions; run both on commit/snapshot changes |
| **How capture works**                   | Why the numbers mean what they mean, and the measurement caveats                                         |
| **Reading report.md**                   | Turning a report into a named bottleneck                                                                 |
| **Known findings & deferred tradeoffs** | Whether what you found is already understood and deliberately accepted                                   |
| **Native specifics**                    | Android/iOS capture differences                                                                          |

**[`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md)** is the separate runbook for a
**physical iPad** — the highest-fidelity target, and the only one that exercises the real
WebKit/JavaScriptCore engine, Apple GPU, and 120 Hz ProMotion display together. Read it before any
real-device profiling; start at its "Which approach to use" table.

Two things to check before drawing a conclusion:

* **Pick the command that brackets the window you care about.** Every web command except
  `perf:mount` starts tracing *after* load, so startup questions need `perf:mount`.
* **Undo memory does not show up on the JS heap.** History rasters live in canvas backing stores, so
  `performance.memory` stays flat while real memory grows; `perf:undo` reports the true cost
  analytically.

For page-load / Core Web Vitals work on a throttled device, use `lighthouse-audit` instead. For the
cross-platform snapshot, `run-performance-matrix`.
