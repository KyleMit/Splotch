# Profiling Splotch on a physical Android device

The counterpart to [`docs/PROFILING-IPAD.md`](PROFILING-IPAD.md). That runbook covers the
highest-*fidelity* target; this one covers the target where the platform gives up the most
information, because Android's tracing is open in a way Apple's is not.

[`docs/PROFILING.md`](PROFILING.md) covers what each `perf:*` command measures.
[`docs/PROFILING-CAMPAIGNS.md`](PROFILING-CAMPAIGNS.md) covers the ways an unattended run produces
numbers that look fine and are wrong — read it before capturing anything.

Everything below was run against the campaign phone: **SM-G990U1, Android 16, 120 Hz**, package
`art.splotch.app`.

## Which instrument answers which question

The app's own probe is the gate. These three are what you reach for when the probe says something is
wrong and cannot say why.

| Instrument                      | Answers                                                                              | Cost                     |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| The app's real-screen probe     | Did we drop frames, and by how much — the gate                                       | none beyond the capture  |
| `dumpsys gfxinfo … framestats`  | Where each frame's time went between vsync and present, per frame, from the platform | ~free, always available  |
| Perfetto                        | What the whole device was doing — the app, the GPU, the scheduler, other processes   | ~2.8 MB/s of trace       |
| Chrome DevTools `Tracing` (CDP) | What the *renderer* was doing inside the WebView — JS, style, layout, paint          | moderate, browser target |

The split that matters: **the probe and CDP see the web content; `gfxinfo` and Perfetto see the
platform.** A frame the probe scores as lost is one the page failed to produce; a frame `gfxinfo`
scores as janky may have been produced on time and missed its deadline somewhere the page cannot
observe. When the two disagree, that disagreement *is* the finding.

## `dumpsys gfxinfo` — the cheap per-frame read

Always present, no setup, no root, and it costs nothing to leave on.

```sh
adb -s <serial> shell dumpsys gfxinfo art.splotch.app reset      # zero the counters first
# …drive the interaction…
adb -s <serial> shell dumpsys gfxinfo art.splotch.app framestats
```

The summary block is the triage read:

```
Total frames rendered: 25
Janky frames: 8 (32.00%)
50th percentile: 11ms
90th percentile: 85ms
95th percentile: 89ms
99th percentile: 101ms
Number Missed Vsync: 3
Number High input latency: 34
Number Slow UI thread: 4
Number Slow bitmap uploads: 1
Number Slow issue draw commands: 5
Pipeline=Skia (OpenGL)
```

The named counters are the useful part, because each one points at a different subsystem —
`Slow bitmap uploads` is texture upload, `Slow issue draw commands` is the render thread,
`Slow UI thread` is the main thread, `High input latency` is the input pipeline ahead of any of
them. A percentile alone cannot distinguish those.

`framestats` then dumps a per-frame CSV between `---PROFILEDATA---` markers, one row per frame, in
nanoseconds:

```
Flags,FrameTimelineVsyncId,IntendedVsync,Vsync,InputEventId,HandleInputStart,AnimationStart,
PerformTraversalsStart,DrawStart,FrameDeadline,FrameStartTime,FrameInterval,WorkloadTarget,
SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,DequeueBufferDuration,
QueueBufferDuration,GpuCompleted,SwapBuffersCompleted,DisplayPresentTime,CommandSubmissionCompleted,
```

Subtract adjacent columns to get each stage. The intervals worth naming:

| Interval                                 | Is                                                |
| ---------------------------------------- | ------------------------------------------------- |
| `IntendedVsync` → `Vsync`                | how late the frame's callback started at all      |
| `HandleInputStart` → `AnimationStart`    | input dispatch                                    |
| `DrawStart` → `SyncQueued`               | recording the display list on the UI thread       |
| `IssueDrawCommandsStart` → `SwapBuffers` | the render thread handing work to the GPU         |
| `SwapBuffers` → `GpuCompleted`           | the GPU                                           |
| `FrameCompleted` − `IntendedVsync`       | the whole frame, and what `Janky` is derived from |

Four things about this table are worth knowing before drawing a conclusion from it.

* **`FrameInterval` tells you the refresh rate the frame was produced against**, and on this phone
  it reads `8336482` ns — 8.34 ms, i.e. 120 Hz. That matters more here than anywhere else in the
  toolchain: Chrome raises the display to 120 Hz *only while touch is arriving*, so a capture whose
  input cadence is too low silently falls back to 60 and every frame gets measured against the wrong
  beat. Read `FrameInterval` before believing any per-frame number.
* **`InputEventId` is 0 on frames not attributed to an input event**, including ones the WebView
  drew in response to touch. Do not use it to select in-contact frames; use the probe's own contact
  window.
* **A row is a frame the *Android view system* produced.** Splotch draws into a WebView, so the
  compositing the platform sees is not one-to-one with the page's `requestAnimationFrame` frames.
  This is the instrument's blind spot and the reason it supplements the probe rather than replacing
  it.
* **`Pipeline=Skia (OpenGL)`** is worth reading — a device on the Vulkan pipeline attributes GPU
  time differently, so it is part of the provenance of any number quoted from here.

## Perfetto — the Instruments-trace analogue

`/system/bin/perfetto` ships on the device. The categories that matter for a canvas app:

```sh
adb -s <serial> shell perfetto -o /data/misc/perfetto-traces/run.pftrace \
  -t 10s -b 32mb gfx view sched input
adb -s <serial> pull /data/misc/perfetto-traces/run.pftrace
adb -s <serial> shell rm /data/misc/perfetto-traces/run.pftrace
```

Open the result at [ui.perfetto.dev](https://ui.perfetto.dev), which runs entirely in the browser
and uploads nothing.

| Category | Gives                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| `gfx`    | `SurfaceFlinger` composition, buffer queues, GPU completion — where a frame was lost |
| `view`   | the view system's own measure/layout/draw                                            |
| `sched`  | which thread was on which core, and what preempted it                                |
| `input`  | touch dispatch, to line input up against frames                                      |

`sched` is the one that pays for itself. The question "was the app slow or was it descheduled?" has
no answer from the app's side, and this is what answers it — which is exactly the asymmetry #1221
noted against iPad, where Instruments has always given it.

Three practical notes, all learned by running it:

* **Always pass `-t <duration>`.** Run through `adb shell` without a PTY, Perfetto warns that
  `CTRL+C won't gracefully stop the trace` — an unattended run that relies on interrupting it will
  never write a file. A fixed duration is the only reliable unattended shape.
* **Budget the size.** `gfx view sched input` for 5 seconds wrote **14 MB**. `-b` is the in-memory
  ring buffer, so a long trace with a small buffer silently keeps only the tail.
* **The device path must be `/data/misc/perfetto-traces/`.** Elsewhere the daemon cannot write and
  the failure names permissions rather than the path.

## Chrome DevTools `Tracing` — inside the WebView

For the **browser** target, `perf:android:browser:actions` already reaches the device over direct
CDP (ADR-0092). That connection also carries the `Tracing` domain, which is the only one of these
instruments that attributes time to *page* work — script, style, layout, paint — rather than to the
frame the platform ended up compositing.

This is the piece with no iPad counterpart: `pymobiledevice3`'s CDP bridge answers
`'Tracing' domain was not found` (see `docs/PROFILING-CAMPAIGNS.md`). On Android it works, so a
question like "which function is making crayon expensive" is answerable here and is not on the iPad.

For the **native** target the WebView must be marked debuggable for CDP to see it at all; a release
build will simply not appear in the target list, which reads as a connection problem and is not one.

## Do not assume the instrument is free — measure it

The iPad side measured this rather than assuming, and found `--all-processes` Instruments tracing
had **no measurable effect** on the app's own scores. That result does not transfer: it covered
*sampling* templates, and Perfetto's `sched` is closer to instrumenting than sampling.

The technique does transfer, and it is cheap. Capture the same gesture three ways — no trace,
`gfxinfo` only, full Perfetto — and score all three with the app's own probe. If input cadence and
marked JS work per frame are unchanged, the trace is not moving what it measures. Ten minutes, and
it converts an assumption into a number.

Do this **before** quoting a Perfetto-traced capture as a performance result, not after.

## The traps that apply here specifically

`docs/PROFILING-CAMPAIGNS.md` is the full catalogue. Three of its entries bite hardest on Android:

* **Input cadence is a measured variable.** The Appium browser transport drives this phone at 46.8
  contact moves/s against a 100–170 band, and cells captured that way score ~11% lost frame time
  that means nothing. Use the split transport (`perf:device:frames`), and read the fidelity verdict
  before the result.
* **The fidelity gate is not yet satisfiable on Android** — its `pressure` and `contactGeometry`
  thresholds are calibrated from a hand capture on the iPad, and Chrome cannot produce them. Do not
  widen it; it is what proves a run exercised the real touch path.
* **Never run heavy host work during a capture.** The host drives input dispatch, and contention
  changes cadence.
