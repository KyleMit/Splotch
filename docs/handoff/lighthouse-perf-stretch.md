# Handoff — Lighthouse perf stretch

> 2026-07-22 · branch `claude/page-load-perf-profile-8bur9q` · Cut the two real page-load costs the
> 2026-07-22 production Lighthouse audit found: the ~180 ms idle long task (TBT) and the late
> Quicksand font fetch (Speed Index).

## Objective & non-goals

Two changes, both aimed at the phone-first Lighthouse cell (Perf 82; every other cell is 97–100):

1. **Slice the idle-time long task into <50 ms pieces.** The biggest app-attributed long task in
   every run is chunk `BKEZ0NdK.js` — only ~2 KB transfer, loaded idle at ~3.6 s, but ~293 ms of
   scripting in one task (182 ms phone-first, 134–135 ms tablet-first/phone-repeat). It lands inside
   the TBT window under 4× throttle.
2. **Preload the Quicksand woff2 + trim the unused @font-face subsets.** The font is only fetched at
   ~3.9–4.1 s (discovered via `document.fonts.load` in `+layout.svelte`'s `onMount`, i.e. after
   hydration + idle), so text swaps late — one contributor to phone-first Speed Index 4.3 s (score
   0.75). Lighthouse also flags ~13 KB unused CSS in the @font-face block (the vietnamese/latin-ext
   `unicode-range` subsets never match).

**Non-goals:** the A11y 92 zoom-lock rework (product decision, ADR-0041 — separate conversation);
further hydration trims (~124 ms document task — already optimized, diminishing returns); chasing a
guaranteed phone-first 100 (418 ms of the 640 ms TBT was Lighthouse's own `_lighthouse-eval.js`
artifact + simulate-mode variance is ±15 pts — out of our control).

## State

* Branch `claude/page-load-perf-profile-8bur9q`, **no code changes yet** — audit + analysis only.
* No PR.

| sha     | what                                           |
| ------- | ---------------------------------------------- |
| 2af6b92 | Log 2026-07-22 production Lighthouse audit run |
| (next)  | Add this handoff                               |

Lighthouse reports lived in `lighthouse-reports/` (gitignored, dead with the container). Key numbers
to carry forward — production `splotch.art`, simulated Slow 4G + 4× CPU:

| run           | Perf | FCP   | LCP   | TBT     | SI    | Transfer |
| ------------- | ---- | ----- | ----- | ------- | ----- | -------- |
| phone-first   | 82   | 1.1 s | 1.5 s | 640 ms* | 4.3 s | 759 KB   |
| phone-repeat  | 97   | 1.1 s | 1.1 s | 180 ms  | 2.0 s | 42 KB    |
| tablet-first  | 98   | 1.0 s | 1.5 s | 150 ms  | 1.6 s | 759 KB   |
| tablet-repeat | 100  | 0.9 s | 0.9 s | 60 ms   | —     | 1 KB     |

\* 418 ms of the 640 was `_lighthouse-eval.js` self-attribution; ~295 ms was app blocking, of which
the 182 ms `BKEZ0NdK.js` task is the dominant piece. Font fetch observed 3938–4137 ms, priority
VeryHigh, `/_app/immutable/assets/quicksand-latin-wght-normal.Buj9m_3d.woff2`.

## Decisions made (and why)

* **Attribute before slicing.** `BKEZ0NdK.js` is a hashed chunk name from the 2026-07-22 prod build;
  the hash→source mapping was **not** established. Its profile (tiny code, big CPU, ~3.6 s idle
  start) fits the boot-hidden-overlay idle mount (`web/src/routes/+page.svelte:73-97` — imports
  `$lib/components/bootHiddenOverlays` at idle, mounts one overlay per idle slice) and/or the
  pencil-sound warm-up (`web/src/lib/components/DrawingCanvas.svelte:213-216` →
  `preloadDrawSounds`). Note the overlay queue *already* mounts one-per-idle-slice, so if this is
  the culprit, either the barrel-chunk evaluation itself or a single overlay's mount exceeds 50 ms
  and needs finer slicing — the ParentCenter dialog was already excluded for exactly this reason
  (~200 ms mounted; see comment at `+page.svelte:62-66`).
* **Font fix shape:** SSR-render a `<link rel="preload" as="font" type="font/woff2" crossorigin>`
  from `+layout.svelte`'s `<svelte:head>`, getting the hashed URL via
  `import fontUrl from '@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2?url'`.
  The existing `document.fonts.load` warm-up (`+layout.svelte:21-25`) then becomes redundant —
  remove it if the preload verifiably covers it. Only the latin subset needs preloading: the
  package's other two woff2s (latin-ext, vietnamese) never match the app's text and are never
  fetched — that's also the "unused CSS" trim target (hand-roll a single latin `@font-face` or keep
  index.css and accept the 13 KB of dead rules; the *fetch* cost is already zero).

## Unverified assumptions (test these first)

1. `BKEZ0NdK.js` == the overlay idle-mount and/or sound warm-up path — inferred from timing and
   size, never source-mapped. Could also be some other idle chunk.
2. `ctx.decodeAudioData` is assumed mostly off-main-thread; if the warm-up is the culprit the
   blocking part is more likely fetch/arrayBuffer/JS glue. Not measured.
3. Vite dedupes the `?url` font import to the *same* hashed asset the fontsource CSS references (one
   fetch, not two). Believed but unverified — check the built HTML + network tab.
4. Preloading 28 KB of font on Slow 4G won't push the LCP resource or critical JS later. LCP has
   ~250 ms of headroom (scores 1.0 at 1.5 s) but this needs a before/after run.
5. Earlier font arrival actually moves Speed Index meaningfully — plausible, not proven; SI is also
   inflated by the long tasks themselves in simulation.

## Done & verified

* Full production Lighthouse matrix ran clean (exit 0, no runtime errors) via
  `node .claude/skills/lighthouse-audit/run-audit.mjs` — numbers in the table above.
* TBT contamination math checked from `long-tasks` JSON (eval 418 ms vs app 295 ms blocking).
* No code was changed, so no `npm run check` / `npm test` has been run on anything.

## Risks & next 3 steps

1. **Attribute the long task.** Run `npm run perf:mount` (profiling skill) for a named-marks startup
   trace, and/or `npm run build` locally and map the equivalent chunk to source (chunk hashes will
   differ from `BKEZ0NdK` — match by size/timing/graph, or add `build.sourcemap: true`). Confirm
   which module owns the ~50–180 ms idle task before touching code.
2. **Slice it.** Whatever the owner: break the work into <50 ms pieces with yields
   (`setTimeout(0)`/`scheduleIdle` between steps — e.g. between chunk-eval and first mount, or
   between per-sound fetch/decodes). Re-check with `perf:mount` that no idle task exceeds ~50 ms (at
   4× throttle budget ≈ 12 ms real). Mind the `stopped`-flag unmount guard pattern at
   `+page.svelte:73-97` when restructuring.
3. **Font preload + verify + measure.** Add the preload link (+ drop the `document.fonts.load`
   warm-up if covered), verify single-fetch in devtools, run `npm run check` + `npm test`, then push
   to a `feature/*` branch (restricted Netlify mode — only `feature/*` gets a branch preview) and
   re-run the Lighthouse skill against `https://<slug>--splotchy.netlify.app/`, phone-first × 3,
   comparing medians against the table above. Risk: regressing LCP per assumption 4 — check it in
   the same runs.

## Reread first

* `.claude/skills/lighthouse-audit/SKILL.md` — the `_lighthouse-eval.js` false-positive section and
  which-target-to-audit table (never the dev server).
* `.claude/skills/profiling/SKILL.md` — `perf:mount` usage and reading report.md.
* `web/src/routes/+page.svelte:55-97` — overlay idle-mount queue + ParentCenter carve-out.
* `web/src/lib/components/DrawingCanvas.svelte:208-216` + `web/src/lib/audio/drawingSound.ts:38-55`
  — sound warm-up path.
* `web/src/routes/+layout.svelte:1-26` — fontsource import + current font warm-up.
* `.claude/rules/svelte.md` — hydration constraints (never insert DOM into the prerendered `/`
  subtree pre-hydration; `svelte:head` additions are fine but keep the rule in mind).
