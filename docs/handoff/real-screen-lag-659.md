# Handoff — real-screen lag on iPad (issue #659)

> 2026-07-30 · branch `experiment/no-snapshot-capture` · PR
> [#662](https://github.com/KyleMit/Splotch/pull/662) (candidate, draft) · Attribute the visible
> drawing lag on `/` on a physical iPad. The instruments are merged (#660); the cause is now
> bisected down to **compositing**, and two more bisect rungs are staged and waiting on a hand-drawn
> Timeline recording.

## START HERE — two recordings, both staged, ~10 s each

The device work is set up but the servers are **gone** (they were local processes). Rebuild them
from "Restoring the rig" below, then have Kyle record. His subjective read has been reliable all day
— collect it alongside each capture.

1. **Rung 2 (no setup): `http://<lan>:4175`** — a quarter-resolution canvas (1.2 Mpx vs 4.7 Mpx).
   Web Inspector → Timelines → uncheck Screenshots + Network Requests → record 10 s, ending with a
   burst of short strokes → export.
2. **Rung 1: `http://<lan>:4173`** — paste the layer-strip CSS below into the console, **do not
   reload**, record the same 10 s.

   ```js
   document.head.insertAdjacentHTML(
     'beforeend',
     `<style>
     .crayon-overlay { display: none !important; }
     .paper-view { display: none !important; }
     .paper-sheet { display: none !important; }
     .brush-ring, .eraser-bubble { display: none !important; }
   </style>`,
   );
   ```

Compare each against the baseline with
`node perf-profiles/compare-timelines.mjs perf-profiles/recordings/192.168.40.75-recording-2.json <new>`.
The metric that decides it is **long composites per commit**, not totals — totals move with how much
Kyle happened to draw.

**What each outcome means** (committed to in advance, so the next session can't rationalise):

* Rung 1 fixes it → the two always-present `.crayon-overlay` canvases (one with
  `mix-blend-mode: darken`, both full-size regardless of brush) are the per-frame cost. Fix: mount
  them only when the crayon is active.
* Rung 2 fixes it → compositing is proportional to canvas area; the lever is `MAX_RENDER_SCALE`
  (`engine.ts:209`, ADR-0015). Ship something gentler than the diagnostic's 1× — 1.5× is ~44% fewer
  pixels.
* Neither → per-frame compositing of a canvas this size is what iPad Safari costs. The honest answer
  is fewer commits plus a documented platform limit, not a code fix.

## Objective & non-goals

**Objective.** Attribute the felt lag on `/` to a named subsystem with measurements behind it, then
fix it. Kyle's standing grant: throwaway seams and diagnostic builds are fine for capture; the
merge-worthy outcome is a non-invasive change.

**Non-goals.** Re-tuning ADR-0066's gates. Shipping any diagnostic build. Chasing the coloring page
— ruled out (§Findings).

## State

| branch                           | what                                                                                                                                                                     | pushed |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `experiment/no-snapshot-capture` | **current.** `SKIP_SNAPSHOT_CAPTURE = true` — all snapshot work removed. Undo deliberately broken. NOT FOR MERGE                                                         | yes    |
| `experiment/patch-canvas-pool`   | pooled patch canvases. **Negative result** — see Decisions                                                                                                               | yes    |
| `free-draw-window`               | harness fixes worth keeping: three-population metrics, uncapped lift frames, `--free-draw` mode. **Also carries #662's coalescing change** (it was cut from that branch) | yes    |
| `coalesce-per-frame-work`        | PR #662, draft, green                                                                                                                                                    | yes    |

Merged: **#660** (the instruments, ADR-0083). Open: **#662** (candidate, unvalidated), **#663** (the
black-flash rendering bug).

Recordings in `perf-profiles/recordings/` (gitignored, on this machine only):
`192.168.40.75-recording-2.json` (baseline, 4174) · `-3.json` (pooled) · `-4.json` (no-snapshot).
Probe captures in `perf-profiles/*ipad-frames*`.

## Findings

**The lag is compositing at the stroke commit, and it is not the drawing engine.** From a hand-drawn
Web Inspector Timeline on `/` (iPad13,8, iPadOS 26.5), 9.3 s window:

| eventType          |   n |       total |          max |
| ------------------ | --: | ----------: | -----------: |
| **composite**      | 293 | **5047 ms** | **255.9 ms** |
| recalculate-styles | 572 |      195 ms |       1.7 ms |
| layout             |  52 |        8 ms |       0.5 ms |
| paint              | 251 |    **3 ms** |       0.5 ms |

15 commits → 15 long composites, each starting 2–192 ms after its commit. Every `engine.*` op stayed
under 1.2 ms. That is why the ADR-0066 gates pass while the screen lags: the cost lands in
compositing *after* the marked work returns.

**Bisect so far:**

| build                      |                                                long composites / commit |
| -------------------------- | ----------------------------------------------------------------------: |
| baseline                   |                                                                     1.0 |
| patch-canvas pool          |                                    0.9 — **allocation is not the cost** |
| no snapshot capture at all | **0.2** — the snapshot's read out of the GPU-backed paper is ~80% of it |

**What remains** is a *separate, continuous* cost: 3608 ms of compositing in a 9.1 s recording, ~375
composites averaging 9.6 ms — about one per frame, eating 60% of a 16.7 ms budget before anything
else runs. Rungs 1 and 2 exist to attribute that.

**Also established:** stalls are at the **finger-lift**, never mid-stroke (12 of 34 lifts stalled,
up to 500 ms); input is fine throughout (~120 moves/s sustained, 5–7 ms queue delay, `kind: touch`);
blank paper reproduces it, so the coloring page is out; undo-raster accumulation is out (stalls at
11–13 MB while a synthetic soak reached 33.9 MB clean); the encode tier is out (`blobBytes` 0 —
those `encode×1` marks are a no-op idle callback landing inside the long frame).

## Decisions made (and why)

* **Patch-canvas pooling was tried and did not work.** Reuse by "at least as large" (assigning
  width/height reallocates, which is the cost being avoided), `restorePatch` drawing the sub-rect.
  Per-commit long composites went 1.0 → 0.9. Branch kept as the record; **do not revive without new
  evidence**.
* **The metrics were reporting the wrong population.** They counted only in-contact frames, and
  capped lift frames at 250 ms as "the page went idle". Both wrong: a capture showed 8753 ms lost
  *between* strokes vs 2422 ms during them, and rAF never idles (13,195 frames between strokes at 17
  ms p50). Fixed on `free-draw-window`.
* **Free-draw mode over contact-banking** for hand runs — Kyle's suggestion. A START button then a
  fixed wall-clock window, so the gaps are first-class.
* **Three builds served at once** (worktrees + separate ports) so an A/B costs no rebuild and no
  branch switching mid-session.

## Unverified assumptions

* **The crayon overlays are the per-frame cost.** This is the leading hypothesis for rung 1 and is
  *not* measured. Two full-size canvases sit in the DOM regardless of brush
  (`DrawingCanvas.svelte:291-292`), one with `mix-blend-mode: darken`.
* **Web Inspector inflates composite records.** The absolute 245 ms is probably generous. The probe
  measured 250–764 ms lift stalls with nothing attached, so the attribution holds, but don't quote
  245 ms as the true cost.
* **Why synthetic input never reproduces any of this** is still unexplained — 0–1 stalled lifts in
  ~11 vs 12 in 34 by hand, same app work either way.
* The `free-draw-window` branch's harness fixes have **not** been PR'd or reviewed.

## Done & verified

* `npm run check` clean (1043 files) · `test:unit` 918 · `test:scripts` 374 (36 files)
* `test:e2e --grep "undo|clear|crayon|magic|multitouch"` — 58 passed on the pool branch (undo
  correctness was the risk there)
* Both diagnostic builds verified *functionally*, not by grep: 4173 reports `rasterBytes: 0` after a
  stroke while 4174 reports 52440; 4175's canvas measures 1282×915 vs 4174's 2564×1830
* #660 merged green; #662 green
* `perf:frames:analyze` re-runs cleanly over every saved capture

## Risks & next 3 steps

1. **Run rungs 2 and 1** (top of this file) and compare. That is the whole remaining question.
2. **Decide #662.** It is measured (`RecalculateStyles` 3.43 → 1.32 per frame) but the Timeline now
   shows `recalculate-styles` totalling only 195 ms of a 9.3 s recording — so it is a real
   micro-optimisation that is **almost certainly not the lag**. Merge it as a tidy-up or close it;
   don't let it masquerade as the fix.
3. **PR the `free-draw-window` harness fixes** — but split the coalescing change out first, or
   rebase onto `main` after #662 resolves, so the branch carries only harness work.

**Risk:** three worktrees exist (`/tmp/splotch-main`, `/tmp/splotch-scale`) with symlinked
`node_modules`. `git worktree remove` them when done, or `git worktree prune` after `/tmp` clears.

## Restoring the rig

```sh
# baseline (main) on 4174, no-snapshot on 4173, quarter-scale on 4175
git worktree add /tmp/splotch-main origin/main && ln -s $PWD/node_modules /tmp/splotch-main/node_modules
(cd /tmp/splotch-main && npm run perf:build && PUBLIC_ENABLE_DEV_HARNESS=true node scripts/perf/serve.mjs --port=4174 --strict-port &)
git checkout experiment/no-snapshot-capture && npm run perf:build
PUBLIC_ENABLE_DEV_HARNESS=true node scripts/perf/serve.mjs --port=4173 --strict-port &
# 4175: worktree off main with MAX_RENDER_SCALE = 1 (engine.ts:209)
```

`ipconfig getifaddr en0` for the LAN address the iPad uses. The iPad must be unlocked with Safari
foregrounded — a suspended tab answers nothing and the failure message says so.

## Reread first

* `perf-profiles/compare-timelines.mjs` — the comparison tool (gitignored; recreate from the handoff
  history if lost)
* `web/src/lib/drawing/undoHistory.ts:407` `capturePatchesUnder` — the commit-path copy
* `web/src/lib/components/DrawingCanvas.svelte:291` — the always-present crayon overlays
* `.ruler/skills/profiling/ipad-device-profiling.md` — the runbook, incl. the Timeline recipe and
  the 60 Hz ceiling
* `.ruler/skill-notes/profiling.md.template` — design history; the metric definitions that were
  wrong and why
* `scrapbook/perf/2026-07-29-ipad-real-screen/findings.md` — the published baseline
* ADR-0083 (the instrument), ADR-0066 (+ its frame-budget amendment), ADR-0069/0074 (patch
  snapshots)
