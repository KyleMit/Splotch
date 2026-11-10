# RN memory: bones or bug?

2026-11-10, Claude. Device: the Galaxy (S21 FE, Android 16, 6 GB). Raw data, scripts and logs are in
the campaign scratch folder under `rn-memory/` (rig file).

## Pre-registered (written 2026-11-10 08:55 EST, before any capture)

**Workload, one run per arm** (`rn-memory/bin/gen.py`, `run.zsh`): cold launch, Clear, then `uinput`
dense Crayon (the lanes' scribble: 2 s strokes at ~2,000 px/s, 0.5 s lifts) for 32 min. Undo ×3 (400
ms apart) every 60 s. **Phase A**, 0–20 min: one picture, never cleared. **Phase B**, 20–32 min:
Clears at 20.5, 24.5 and 28.5 min, and a final Clear at 32 min. Then 60 s idle, then HOME +
`TRIM_MEMORY_BACKGROUND` (React Native runs a full Hermes GC), then resume. `dumpsys meminfo` every
30 s (shipping: app + its WebView renderer).

| Arm               | Build                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Shipping          | `art.splotch.app.baseline.main`, ef3d1eb20                                                     |
| Frozen RN         | `art.splotch.app.dev`, the installed RN probe Release 427756f14                                |
| Guardrails patch  | `art.splotch.app.dev.mem`, 24928fead + logging only (Hermes counters, Skia GPU cache counters) |
| Best fix (if any) | `art.splotch.app.dev.mem`, local branch `claude/spike-rn-memory`                               |

**Readings.** *G* = PSS after the final Clear and 60 s idle, minus PSS on blank paper before the
first stroke. *Peak* = the highest sample. *S15* = least-squares PSS slope over the last 15 min of
drawing (17–32 min). *SA* = slope over minutes 10–20 of phase A (one growing picture). The Clear
drop is PSS 30 s after a Clear minus the sample before it; the GC drop is `bg-gc` minus `idle60`.

**Leak or plateau, per arm.** *Plateau* if S15 ≤ max(1.0 MB/min, shipping's S15). *Leak* if S15 > 2
MB/min, or the post-Clear floors at 21, 25 and 29 min rise by more than 2 MB/min. In between:
*creep*, reported as such. Separately, an arm *climbs with the picture* if SA > max(1.5 MB/min,
shipping's SA).

**Fix gate (pass bar).** On the fix build: plateau (as above, on S15 **and** SA), and G ≤ 2 ×
shipping's G, and no visible drawing regression (end-of-phase screenshots against the guardrails
build: same Crayon look, all strokes inked per the probe's cohort lines).

**Verdicts.**

* **Bug:** fixes costing ≤3 agent-days in total (the guardrails patch included) pass the fix gate
  without a big tradeoff.
* **Bones:** the growth is rooted in the RN + Skia + Hermes memory model (for example native or GPU
  memory freed only by a garbage collection, or memory that must grow with the picture) and no fix
  passes the gate without a big tradeoff, which is named.
* **Unclear:** neither; the missing measurement is named.

**Numbers that would change the decision:** a *leak* that survives the best fix, or a best-fix peak
that would reach the floor device's kill threshold inside a 30-minute dense session.

## Floor devices and kill thresholds (sources, before the estimates)

| Floor (`docs/COMPATIBILITY.md`) | Smallest device it admits                                                                                 | Paper raster vs the Galaxy's 1080×2016 | Kill threshold for the foreground app                                                                                                                                                                                                                        | Confidence   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Native iOS 16.4+                | iPad (5th gen, 2017) and iPad Pro 9.7": **2 GB**, 2048×1536                                               | ~1.35× (about 11.7 MB per full raster) | Jetsam per-process limit on `phys_footprint` (GPU memory included). Apple publishes none; crowd-sourced kills on 2 GB devices sit at **~1.35–1.4 GB**. Limits move between OS releases (a forum report has iPadOS 26.4 halving an 8 GB iPad's limit to 3 GB) | moderate–low |
| Native Android API 24+          | 2016-era phone: typically **2 GB**, 720×1280 (Android 7 phones with 1 GB, such as the Moto C, also exist) | ~0.36× (about 3.2 MB)                  | No per-app native cap; `lmkd` kills the foreground app last, once free memory falls under its minfree (~72 MB on a 2 GB device). In practice **~0.9–1.2 GB PSS** on a 2 GB phone and ~0.4–0.5 GB on 1 GB, depending on OEM, zram and what else is running    | low          |

Two platform facts decide whether memory that only a garbage collection frees counts against these
limits:

* **iOS:** a memory warning reaches the app before Jetsam kills it, and React Native answers it with
  a full Hermes GC (`RCTInstance._handleMemoryWarning` → `collectGarbage`).
* **Android:** React Native collects only on `TRIM_MEMORY_RUNNING_CRITICAL` (or on leaving the
  foreground). Since API 34 the system never sends a foreground app `RUNNING_*` levels, so on a
  current phone nothing prompts that collection before `lmkd` acts. The API 24 floor still gets
  them.

## Results (2026-11-10, 16:50 EST)

One run per arm of the workload above. MB are `dumpsys meminfo` kB / 1024, from the lane's
`table.py` and `summary.py`; slopes are MB per minute. Raw data is in `rn-memory/runs/` (rig file);
the start, 20-min, 30-min and end screenshots of each run were kept.

| Arm              | Run, start        | On the device                                                                                    |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| Shipping         | `ship-1`, 08:55   | `art.splotch.app.baseline.main`, ef3d1eb20                                                       |
| Frozen RN        | `frozen-1`, 16:09 | `art.splotch.app.dev`, on-device APK sha256 `7e6af612…28bb` (the frozen probe)                   |
| Guardrails patch | `mem1-1`, 12:59   | `.dev.mem` **mem-1**, `1ef1c80b8` (24928fead + counters)                                         |
| Best fix         | `mem2-1`, 15:34   | `.dev.mem` **mem-2**, `c904b4026`: mem-1 + a Ganesh purge of resources unused for 5 s, 96 MB cap |

`mem1-1` lost its end block (idle, GC, resume) when the disk filled at 13:32, so it has no G or GC
drop. It was not re-run: no rule or gate reads mem-1's G.

| Arm       | Blank paper | Peak | G            | S15   | SA    | Clear drops 20.5 / 24.5 / 28.5 | GC drop      | Post-Clear floors 21 / 25 / 29 (slope) |
| --------- | ----------- | ---- | ------------ | ----- | ----- | ------------------------------ | ------------ | -------------------------------------- |
| Shipping  | 283         | 392  | +53          | −2.16 | +0.82 | −27 / +1 / 0                   | −60          | 365 / 370 / 373 (+0.99)                |
| Frozen RN | 271         | 926  | **+486**     | +5.60 | +2.70 | +36 / +92 / +96                | **−287**     | 625 / 720 / 733 (**+13.5**)            |
| mem-1     | 272         | 636  | not captured | +0.20 | +8.76 | −62 / −5 / +10                 | not captured | 571 / 567 / 577 (+0.76)                |
| mem-2     | 295         | 580  | **+160**     | −2.60 | +5.23 | −94 / −1 / +4                  | −97          | 471 / 466 / 472 (+0.11)                |

Bars from shipping's numbers: plateau if S15 ≤ 1.0; leak if S15 > 2.0 or the floors rise > 2.0;
climbs with the picture if SA > 1.5.

| Arm       | Class    | Climbs with the picture |
| --------- | -------- | ----------------------- |
| Shipping  | plateau  | no                      |
| Frozen RN | **leak** | yes                     |
| mem-1     | plateau  | yes                     |
| mem-2     | plateau  | yes                     |

**Fix gate on mem-2: fail.**

| Criterion    | Bar                   | mem-2                                                                                                                                                                                                                                    | Result   |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Plateau, S15 | ≤ 1.0                 | −2.60                                                                                                                                                                                                                                    | pass     |
| Plateau, SA  | ≤ 1.0                 | +5.23                                                                                                                                                                                                                                    | **fail** |
| G            | ≤ 2 × 53.4 = 106.7 MB | +160                                                                                                                                                                                                                                     | **fail** |
| Drawing      | same as mem-1         | Same Crayon texture at full resolution; at 20 min 0.3% of paper pixels differ from mem-1 (8% fuzz), at 30 min 4% (a stroke in flight). 718 of 718 scripted strokes inked, one stroke per probe cohort, as in mem-1 and frozen (718 each) | pass     |

Two mem-2 samples (19.5 and 20.5 min) caught a +88 MB native spike that decays within 30 s of an
Undo burst; it inflates SA and the 20.5 Clear drop. Without the 19.5 sample SA is still +2.79, a
fail.

## What holds the memory

* **Frozen: garbage only a GC frees.** Clears raise memory instead of lowering it, native heap
  swings between 120 and 520 MB, and HOME + GC frees 287 MB (native Heap Alloc 341 → 92 MB): the
  screen-sized layer rasters that react-native-skia's canvas pins until a Hermes GC
  (`spike-guardrails.md` §2), plus Ganesh textures (GL 34 → 143 MB). On Android 14+ nothing runs
  that GC in the foreground, so in use it behaves as a leak.
* **mem-1** removes the pinned rasters (floors flat), but GL climbs 28 → 126 MB through every Clear:
  Ganesh's cache never purges (118 MB of purgeable textures at 32 min, against a 256 MB budget).
* **mem-2** holds the Ganesh cache at 8 MB while drawing. Its G of +160 MB is:

| Part                       | Share of G | What it is                                                                                                                                                                                                                                                               |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hermes heap (`Unknown`)    | +80        | The heap grows 20 → 104 MB in phase A, stepping up at Undo bursts (live JS peaks at 54–82 MB, because each Undo replays the whole picture on the JS thread), and stays at 88–100 MB after Clears though live JS falls to ~20 MB. The full GC on HOME returned 4 MB of it |
| Native heap                | +53        | +19 MB live (Heap Alloc); the rest is pages the allocator kept after replay bursts. In phase A native PSS climbs 1.9 MB/min while live native allocations climb 0.3                                                                                                      |
| GPU (GL + EGL + other dev) | +35        | Textures from the final Clear left in Ganesh: the purge runs only while frames draw, and idle paper draws none. Freed on HOME                                                                                                                                            |

So mem-2's climb with the picture follows the height of the Undo replay's peaks, which Hermes and
the allocator keep; the picture itself holds little (live native +0.3 MB/min).

## Verdict: unclear

**The leak is a bug, and it is fixed.** The best fix takes the floors from +13.5 to +0.11 MB/min,
the peak from 926 to 580 MB and G from +486 to +160 MB, with no drawing regression.

**Whether what remains is bones is unclear.** Not *bug*: no fix tried passes the gate (SA +5.23
against ≤ 1.0, G +160 against ≤ 107). Not *bones*: each remaining part has a named, untried fix
rather than a known big tradeoff.

**The missing measurement:** this workload on mem-2 plus (a) an Undo that does not replay the whole
picture through JS (the Undo lane's tile snapshots, ported onto `claude/spike-rn-memory`), (b) a
Ganesh purge after Clear and when the paper goes idle, and (c) a native allocator purge
(`mallopt(M_PURGE)`) after Clear and Undo bursts. If it reaches SA ≤ 1.0 and G ≤ 107, it is a bug;
if the Hermes heap or native PSS still climbs with the picture, it is bones.

**Crash risk** (thresholds from the floor table, low confidence):

* **Frozen** peaked at 926 MB at 24 min, inside a 2 GB Android phone's kill range. Most of it is
  screen-sized rasters, so a 720p phone would hold about a third as much, and phones before API 34
  get `RUNNING_CRITICAL` and collect. The exposed case is a 2–3 GB phone with a large screen on
  Android 14+.
* **mem-2** peaked at 580 MB (transient; 455–485 MB between spikes), at least 320 MB under a 2 GB
  Android phone's range. The iPad was not measured. The purge is Android-only (OpenGL), so an iPad
  keeps mem-1's GPU growth; scaling the raster parts by 1.35× puts a 30-minute peak near 0.7 GB,
  against Jetsam's ~1.35 GB, and iOS sends a memory warning (a Hermes GC) first.
* Neither of the pre-registered "numbers that would change the decision" occurred: no leak survives
  the best fix, and its peak stays under both floors' thresholds.
* A 1 GB Android 7 phone (0.4–0.5 GB) is at risk in both apps: shipping peaks at 392 MB here, mem-2
  sits near 470.

## Price

| Work                                                                                                        | Agent-days | State                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| Land mem-1 + mem-2: react-native-skia C++ patch (ADR-0119 review), canvas-pin audit, iOS Metal check, tests | 1–2        | Measured: removes the leak (the guardrails lane's estimate) |
| Ganesh purge after Clear and on idle                                                                        | ~0.25      | Untried; up to −35 MB of G                                  |
| Native allocator purge after Clear and Undo bursts                                                          | 0.25–0.5   | Untried; up to −34 MB of G                                  |
| Undo without a whole-picture replay                                                                         | 2–3        | The Undo lane's estimate, already on RN's repair list       |

The memory work alone is ~1.5–2.75 agent-days, inside the 3-day bug bar. If the gate also needs the
Undo rewrite, the total is ~3.5–5.75 days, over the bar as written, though that work is already
priced under Undo.

**Device state.** mem-2 stays installed as `art.splotch.app.dev.mem`, because the missing
measurement builds on it. `.dev`, `.dev.mem` and `.baseline.main` were left on Pen with a cleared
page. The store app was not touched.

## Settle run (mem-2 + tile Undo + purges)

2026-11-10, Claude. The missing measurement above: the same workload, scripts and scoring (`run.zsh`
held under the Galaxy and rig locks, `summary.py`, `components.py`, `cmp.zsh`), one run. Raw data is
`rn-memory/runs/settle-1/` (rig file).

**Build.** Local branch `claude/spike-rn-memory-settle` off mem-2 `c904b4026`, never pushed, built
like mem-2 (probe Release, `EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1`, build tag `mem-settle`, arm64, debug
key) and installed over `.dev.mem` (APK sha256 `73b0aabf…8474`). Type check and 7 native ink, Undo
and probe test files (79 tests) pass on the branch.

| Commit      | Adds                                                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3c75b4254` | (a) The Undo lane's tile snapshots (`764d43a6a` + `be6ed6674`) without the verify build, device log line or `.dev.undo` suffix; the scene's log callback stays as a test seam                                  |
| `8ac70e177` | (b) A timer on the presenting thread's looper, pushed back by every frame, purges every dead (scratch) Ganesh texture 2 s after the last frame                                                                 |
| `236584509` | (c) `SplotchPurgeNativeHeap`, a JSI function in the Skia patch: `mallopt(M_PURGE_ALL)` (M_PURGE before API 34) on a detached thread; the app calls it 2 s after the last Clear or Undo, so a burst purges once |

**Bar check** (written 17:27 EST, before the run): readings exactly as pre-registered, no outlier
removal. *Bones* if the gate fails and the failing reading is carried, more than half of it, by the
Hermes heap (`Unknown`) or native PSS, at ≥ 1.0 MB/min each over SA or, for G, each holding at least
half of G's excess over 106.7 MB. *Unclear* if the excess sits mostly in GPU memory or the run is
invalid.

| Arm      | Blank paper | Peak | G        | S15   | SA    | Clear drops 20.5 / 24.5 / 28.5 | GC drop | Post-Clear floors 21 / 25 / 29 (slope) |
| -------- | ----------- | ---- | -------- | ----- | ----- | ------------------------------ | ------- | -------------------------------------- |
| Shipping | 283         | 392  | +53      | −2.16 | +0.82 | −27 / +1 / 0                   | −60     | 365 / 370 / 373 (+0.99)                |
| mem-2    | 295         | 580  | +160     | −2.60 | +5.23 | −94 / −1 / +4                  | −97     | 471 / 466 / 472 (+0.11)                |
| Settle   | 242         | 527  | **+201** | +1.83 | +1.12 | −2 / −24 / −12                 | −105    | 498 / 482 / 506 (+0.93)                |

Class: **creep** (S15 between 1.0 and 2.0, floors flat), and it does **not** climb with the picture
(SA ≤ 1.5). No focus loss; 718 of 718 strokes inked. The peak (527 MB at 27.5 min) is a plain
sample, not a spike. The blank-paper sample came in 53 MB under mem-2's (EGL 66 against 84 MB,
native 42 against 55). After 60 s idle the settle build sat at 443 MB, against mem-2's 455 and
shipping's 336.

**Fix gate: fail.**

| Criterion    | Bar         | Settle                                                                                                                                                                   | Result   |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Plateau, S15 | ≤ 1.0       | +1.83 (Hermes +1.04, native +1.02)                                                                                                                                       | **fail** |
| Plateau, SA  | ≤ 1.0       | +1.12 (Hermes +0.68, native +0.52)                                                                                                                                       | **fail** |
| G            | ≤ 106.7 MB  | +201; +148 on mem-2's blank-paper sample                                                                                                                                 | **fail** |
| Drawing      | same as mem | Same Crayon texture; pixels differing (8% fuzz) from mem-2: 0.29% at 20 min (mem-1 vs mem-2: 0.30%), 2.9% at 30 min (4.2%, a stroke in flight); 718 of 718 strokes inked | pass     |

**What holds G** (MB, `components.py`; idle60 minus blank paper):

| Part                    | Settle              | mem-2          | What it is                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hermes heap (`Unknown`) | +101                | +80            | The heap reaches 80 MB by 5 min and 104–116 MB in phase B, while live JS after a collection peaks at 32 MB and ends at ~22. JS allocates 252 MB/min while drawing (mem-2: 873, from the Undo replays), and the collector sizes the heap to that churn. Clear does not shrink it; the full GC on HOME returned 4 MB |
| Native heap             | +77 (live +31)      | +53 (live +19) | The live part is freed only by a garbage collection: the HOME GC took Heap Alloc from 91 to 57 MB, under launch's 60. The allocator purge ran 35 times (p50 11 ms, max 30 ms, off the JS thread), yet at idle native PSS sat at 119 MB against 91 MB allocated (launch: 42 against 60)                             |
| GPU (GL + EGL + other)  | +22 (+10 / +8 / +4) | +35            | The idle purge ran after the final Clear and cut Ganesh's cache from 26.5 to 8.7 MB (the paper's texture). GL still rose 13.6 → 49.9 MB at that Clear and held until HOME, as in mem-2: driver memory outside Ganesh's cache                                                                                       |

**Undo**, as a proxy (the probe does not time Undo; `rn-memory-settle/bin/undo-proxy.py`): the worst
first-dot delay of the strokes after each Undo burst, phase A, p50 / p90 / max: settle 40 / 42 / 70
ms; mem-2 5.8 / 10.6 / 12.0 s; frozen 5.9 / 11.7 / 14.2 s. On a 15–20-minute picture a frozen Undo
burst holds the next strokes' ink for over 10 s.

**Verdict: bones** (by the bar check above; G fails with its excess held by the Hermes heap, +101,
and the native heap, +77). It is a high-water mark, not growth: floors are flat, SA is under the
"climbs with the picture" bar, and no leak survives. **Price:** a dense 32-minute session leaves RN
~200 MB above launch (443 MB) where shipping keeps +53 (336 MB); peak 527 MB. Shrinking it means
either a Hermes GC set to a smaller heap target, which buys memory with more collection on the JS
thread that runs the ink (the probe already counts 4–5 s of GC time per minute of drawing), or
cutting the drawing path's JS churn, whose size and gain are unmeasured. A native-triggered GC on
idle (untried, ~0.25 day) would take back the ~35 MB of GC-held native memory, not the gate's ~95 MB
excess. Untested: how much of the churn is the probe's own (every arm here is a probe build).

**Decision-changers: none.** No leak survives (floors +0.93 MB/min; S15 +1.83 is creep, under the
2.0 leak bar), and the peak of 527 MB sits at least ~370 MB under a 2 GB Android phone's estimated
kill range. The iPad was not measured; both purges are Android-only.

**Device state.** The settle build stays installed as `art.splotch.app.dev.mem`, left on Pen with a
cleared page. `.dev` and `.baseline.main` were not touched; the store app was not touched.
