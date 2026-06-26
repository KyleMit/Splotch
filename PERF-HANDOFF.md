# Perf investigation handoff (temporary — delete after handing to the new chat)

Context for continuing the drawing-engine performance work in a fresh thread.
Everything here is committed/working on `main` unless noted. **Nothing was committed
during the session** — all changes are in the working tree.

## What started this

Commit `e0f5de8` (ADR-0033 command-replay undo) made the **undo button nearly
unresponsive on a native iPad**. Root cause: undo replayed *every* op of every
retained command, and one continuous scribble = thousands of ops (one op per
pointermove frame, no cap) → O(total ops) at 4× DPR.

**Fix shipped (this session, uncommitted): ADR-0035 "keyframe long commands."**
A command whose op list passes `OP_KEYFRAME_THRESHOLD` (48) is collapsed once, at
commit (off the draw frame), into a cumulative square raster keyframe; undo/resize
blit the most recent keyframe and replay only the ops after it. Short strokes stay
cheap ops. See `docs/adrs/0035-keyframe-long-commands.md`.

Key code: `web/src/lib/drawing/engine.ts` — `OP_KEYFRAME_THRESHOLD`,
`MAX_UNDO_STACK_SIZE` (10), `maybeKeyframe`, `paintStateThrough`,
`foldOldestIntoBaseline`, `getUndoDebug()` (test/profiling seam, exposed on
`/dev/engine` as `window.__engine.getUndoDebug`).

## Tooling built this session (all under `scripts/perf/`, wired in `package.json`)

| Command / file | What it does |
| --- | --- |
| `npm run perf:undo` | Drives `/dev/engine` through 3 synthetic shaped sessions (long squiggles / short marks / mixed) + a multi-finger case at iPad-Pro dims; reports keyframe/op counts, draw-vs-undo cost, analytic raster memory. `scripts/perf/undo-scenarios.mjs` |
| `npm run perf:replay -- --recording=<f>` | Replays a **real recorded** finger session through the engine under the profiler (real timing). Reports peak `getUndoDebug` + engine costs. `scripts/perf/replay-scenario.mjs` |
| `npm run perf:serve` | Serves the build on `0.0.0.0:4173` with `/dev/*` unlocked, for recording on a real device over LAN. |
| `npm run perf:ios:analyze -- <export.json>` | Parses a **Safari Web Inspector Timeline** export (NOT a chrome trace — mark-only, ring-buffered, ~1ms clock). `scripts/perf/analyze-webinspector.mjs` |
| `scripts/perf/ipad-recorder.js` | Console snippet — paste in Web Inspector on the iPad to record real pointer stream + UI actions → `copy(__rec.json())`. |
| `scripts/perf/ipad-console-driver.js` | Console snippet — runs the synthetic perf:undo scenarios live on the device. |
| Runbook | `.claude/skills/profiling/ipad-device-profiling.md` (Mac-vs-iPad-tagged: profile A, native B, **record/replay C**). Skill entry: `.claude/skills/profiling/SKILL.md`. |

Recordings live in `perf-profiles/recordings/` (gitignored): `my-session.json`
(session 1), `session2.json` (session 2).

## Findings so far (undo regression is FIXED)

- **Faithful desktop run** (headless Chromium, iPad-Pro 1024×1366@2, 1200–2400 ops/cmd):
  undo stays O(1); keyframe build ~11 ms (software raster, throttled estimate);
  worst-case memory ~313 MB on a 12.9″ Pro (10 keyframes + baseline).
- **Real iPad** (Safari Web Inspector): undo **≤0.33 ms** main-thread (med 0.06);
  keyframe build **~0.3–2 ms** main-thread (canvas is GPU-accelerated → op-issue is
  cheap, raster deferred; paint ≤0.04 ms, composite ≤9.55 ms). No main-thread
  frame-budget violation at finger-lift.
- **Two real sessions characterize the regimes** (this decides the design question
  "should we keyframe by default?" → **no, keep the threshold**):

  | | Session 1 (deliberate drawing) | Session 2 (taps + mixed) |
  | --- | --- | --- |
  | Median ops/stroke | 91 | 23 |
  | Dots (0 moves) | 0 | 5 |
  | > 48-op threshold | 83% | 37% |
  | Peak keyframes / 10 retained | 10 | 4 |
  | ≈ Peak history memory (this canvas) | ~157 MB | ~72 MB |

  Op-path keeps short/tap commands as kilobytes → ~half the memory in the tap
  regime; keyframe-everything would reinstate the cost ADR-0033 removed.

## Open threads (pick up here)

1. **Snapshot-engine comparison (the main remaining task).** Roll `engine.ts` back
   to the pre-ADR-0033 snapshot stack (keep `getUndoDebug` returning a
   compatible `{commands, keyframes, maxOps}` shape so the harness still works),
   then re-run `perf:undo` AND `perf:replay` against `my-session.json` +
   `session2.json`, and diff keyframe-vs-snapshot for memory + undo latency.
   Do it on a branch/worktree so the ADR-0035 engine stays intact.
2. **Fold the two-session evidence into ADR-0035** (its "keyframe everything"
   rejected-alternative is now backed by real data: 37% vs 83% keyframe rate).
3. **Capture a real toddler session** (hand the iPad to the 2-yo) for a truer
   distribution — the record/replay loop is built for exactly this.
4. **Tuning lever:** `OP_KEYFRAME_THRESHOLD = 48` is a one-line knob. Dirty-rect /
   delta keyframes were discussed and deferred (cumulative keyframes' bbox is
   near-full-canvas for the strokes that keyframe; complexity + eraser correctness
   not worth it yet).

## Gotchas / environment notes

- **Port 4173 collision:** `perf:serve` and `perf:replay` both use it — stop the
  server before replaying. Record first, then replay.
- **Run `perf:serve` in your OWN terminal** — background servers started by the
  assistant get SIGTERM'd (exit 143) between turns.
- **Build flags:** `/dev/engine` needs `PUBLIC_ENABLE_DEV_HARNESS=true` (runtime,
  `$env/dynamic/public`); engine marks need `PERF_MARKS=true` (build-time). Full
  build: `cross-env PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true npm run build`.
- **iOS = WebKit only.** No Chrome DevTools timeline from an iPad; Safari Web
  Inspector is the only device profiler. `perf:ios` = Playwright WebKit on the Mac
  (engine, not device). Mac LAN IP via `ipconfig getifaddr en0`.
- **Web Inspector export quirks:** mark-only (no `performance.measure` durations —
  recovered via enclosing record), `markers` is a ring buffer (keep device runs
  short or one scenario per recording), `performance.now()` clamped to ~1 ms.
- **Synthetic synchronous driver contaminates frame timing** (dispatches a stroke
  in one blocking tick); the recorder/replay use real timing and avoid this.
  Headless Chromium rasters in software (slow keyframe-build estimate) — the real
  device GPU is much faster.

## Verify state

`npm run check` (0 errors) · engine E2E: `cd web && npx playwright test tests/engine.spec.ts`
(was 23/23) · `npm run format:check`. ADRs: 0033 (command-replay undo), 0034 (drop
virtual canvas), 0035 (keyframe long commands).
