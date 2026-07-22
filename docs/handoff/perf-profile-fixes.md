# Handoff — perf profile fixes

> 2026-07-22 · branch `claude/draw-performance-profile-rbliof` · Implement the ranked
> recommendations from the 2026-07-22 draw-performance profile
> (`scrapbook/perf/2026-07-22-draw-profile/findings.md`)

## Objective & non-goals

Implement the perf fixes ranked in `scrapbook/perf/2026-07-22-draw-profile/findings.md` — the
profile itself (capture, analysis, artifact publishing, analyzer/skill upgrades) is **done and
committed**; only the engine fixes remain.

Ranked remaining work (findings.md "Recommendations" 1–5; item 6 is a do-nothing):

1. **Clear snapshot: swap-don't-copy.** A clear's fold region is always the full paper; adopt the
   existing paper canvas as the snapshot raster + allocate a fresh paper instead of a 2732²
   `drawImage` copy (575–589 ms hitch throttled/software).
2. **Multi-finger commits: disjoint patch rects** (or defer copy+fold off pointerup). Spread
   five-finger gestures union to ~full paper → 1068 ms patch copy (throttled) at commit.
3. **Rect-limited undo repaint.** `engine.undo` calls `repaintAll` — full-paper blit + full-canvas
   compositor damage per tap (220–275 ms commits in crayon scenarios) where the restored patch rect
   would do.
4. **Hide crayon overlays when crayon inactive** — two always-composited full-size 2×-DPR layers in
   pen-only sessions. **Must be verified on real Android** (ADR-0051: a passing headless run does
   NOT validate compositing changes).
5. **Prefetch next deep-undo decode / consider raising K_LIVE** — rapid undo-to-empty outruns
   `reinflateHotSnapshots` (159.5 ms max step on the five-finger scenario).

Non-goals: `MAX_RENDER_SCALE` / DPR cap changes (deliberate ADR-0015 tradeoff), `engine.scanEmpty`
(known, low impact), crayon triple-render consolidation (headroom, not a fire — noted in findings.md
§5 if appetite appears).

## State

Branch `claude/draw-performance-profile-rbliof` (pushed; no PR). All listed work is committed —
nothing in flight, no dirty files.

| sha       | what                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `9277071` | Committed profile artifacts: `scrapbook/perf/2026-07-22-draw-profile/` (findings + 2 reports)                                                                  |
| `5d41c55` | Analyzer upgrades (per-phase Compositor commit column, Long-tasks-attributed section) + regenerated artifact reports + `profiling` skill update (via `.ruler`) |

Files touched: `scripts/perf/analyze.mjs`, `.ruler/skills/profiling/SKILL.md` (+ generated
`.claude/`/`.agents/` copies), `scrapbook/perf/2026-07-22-draw-profile/**`, `scrapbook/index.html`.

Raw traces (370 MB) live only in this container's gitignored `perf-profiles/` — gone with the
container; re-capture rather than looking for them.

## Decisions made (and why)

* Profile emulation: `perf:web -- --device=tablet` (dsf 2, 2048×2732 backing) + `perf:undo` (iPad
  Pro 12.9, 120 Hz op volume) — the harness's built-in high-DPI/high-refresh coverage; no harness
  capture changes were needed.
* Findings ranked patch-capture hitches and undo full-canvas repaint over compositor raster cost:
  the latter is the known ADR-0015 tradeoff and SwiftShader exaggerates it; the former are
  unbounded-with-gesture-size hitches in the interaction path.
* Long-task attribution + per-phase Commit totals were folded into `analyze.mjs` instead of staying
  ad-hoc scripts (reproducibility); `Receive mojo message` rows in `perf:undo` draw phases are the
  harness's synchronous dispatch — documented as artifact in the skill, don't chase.
* No `perf:web:tablet` npm alias — `--device` flag is documented; declined ADR-0019 script growth.
* `setupDragListeners` in self-time table = Playwright plumbing, not app code (grep confirmed absent
  from `web/src/` and build output) — skill now warns about such symbols.

## Unverified assumptions

* **Swap-don't-copy (rec 1) is safe**: believed clear's snapshot can adopt the paper canvas
  (`undoHistory.pushCommand` full-paper rect path) without breaking the encode tier
  (`encodeColdSnapshots` treats it like any patch canvas) or `restorePatch`. Not prototyped.
* **Disjoint rects (rec 2)** assumes per-finger ops are attributable via `PathOp.pid` (they are
  recorded per pointer — `strokeOps.ts:64`) and that a `Snapshot` can carry multiple rect+canvas
  pairs without breaking `foldRegionForCommands` containment (ADR-0069 invariant). Not prototyped.
* **Rect-limited undo repaint (rec 3)** assumes pending/deferred/active ops intersecting the patch
  rect can be replayed clipped (or that full replay clipped to the rect is correct under a locked
  paper view). The paper-view transform interaction is unchecked.
* **Crayon overlays (rec 4)**: assumed always-composited even when transparent; not measured
  on-device. Sizing them 0×0 may interact with `resizeCanvas` (`engine.ts:425-434`) which sizes them
  unconditionally.
* Absolute ms are SwiftShader + 4×-throttle pessimistic; real-device ratios unverified this session
  (no adb device in cloud container).

## Done & verified

* `npm run perf:web -- --device=tablet` and `npm run perf:undo` — both ran green; reports committed
  under `scrapbook/perf/2026-07-22-draw-profile/`.
* `npm run perf:analyze` re-run on **both** saved traces after the analyzer change — new sections
  render correctly and reproduce the hand-derived findings (clear hitch →
  `EventDispatch
  (pointerup)` 588.8 ms; change-colors → `Commit`-dominated; crayon undo taps →
  220–275 ms full-canvas commits; multi-finger undo → 308 ms MajorGC).
* `npm run ruler:apply` — skill regenerated into `.claude/` + `.agents/`; `npm run format:check`
  clean; both commits pushed.
* NOT run: `npm test`, `npm run check` (no app/TS code was touched — analyzer is plain `.mjs`,
  harness-only).

## Risks & next 3 steps

Risks: recs 1–3 all touch the ADR-0066/0069 undo invariants (patch containment, encode/reinflate
tiers, the deferred-commit path) — `web/src/lib/drawing/undoHistory.test.ts` and the engine E2E spec
are the guardrails; rec 4 is a compositing change and headless validation is explicitly insufficient
(ADR-0051 burn).

1. Implement rec 1 (clear swap-don't-copy) in `undoHistory.pushCommand`; extend
   `undoHistory.test.ts`; re-run `npm run perf:web -- --device=tablet` and compare the clear-phase
   long task + `engine.snapshot` max against the committed baseline.
2. Implement rec 3 (rect-limited undo repaint) in `engine.undo` + `undoHistory` (reuse
   `blitPaperRect`); verify with the engine E2E spec + `npm run perf:undo` (crayon scenarios' undo
   Commit rows should shrink to patch-sized).
3. Implement rec 2 (multi-rect patches or deferred fold) — largest change; consider `/create-adr`
   for whichever shape wins, then `perf:undo` five-finger scenario comparison (commit max 1108 ms
   baseline).

Then rec 4/5 as follow-ups (4 needs a local session with an Android device).

## Reread first

* `scrapbook/perf/2026-07-22-draw-profile/findings.md` — the full ranked findings (numbers, caveats)
* `.claude/skills/profiling/SKILL.md` — harness commands + how to read the new report sections
* `web/src/lib/drawing/undoHistory.ts` — `pushCommand` (`:372`), `foldRegionForCommands` (`:285`),
  `popSnapshot` (`:526`), `repaintAll` (`:605`), tier invariants in the header comment
* `web/src/lib/drawing/engine.ts` — `commitStrokeGroup` (`:617`), `undo` (`:1052`), overlay sizing
  in `resizeCanvas` (`:405`)
* ADR-0066, ADR-0069 (undo snapshot tiers + dirty-rect patches), ADR-0015 (DPR cap), ADR-0051 (why
  compositing changes need on-device proof), ADR-0050 (paper view — affects rec 3's clipping)
