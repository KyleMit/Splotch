# ADR-0049: Idle-Mount the Boot-Hidden Overlays (Parent Center on First Open)

**Status:** Active
**Date:** 2026-07

## Context

The Lighthouse audit's last open item was phone first-visit **Total Blocking
Time of 360–560 ms** — the main thread is busy while the canvas comes up. A
`perf:mount` profile (phone viewport, 4× CPU throttle, Slow-4G) showed the
entire cost is one ~470–510 ms hydration long task, and per-call
`performance.measure` instrumentation ruled out the suspected lever:
`+page.svelte`'s `onMount` calls (`initPWAUpdates`, `hydrateApiKey`,
`initInstallPrompt`, …) total **~18 ms** of it. What actually filled the task
was evaluating and hydrating the six overlays that are always invisible at
boot: Color Picker, Coloring Book Picker, Parent Center, AI prompt, AI result,
and the Install Banner (which only appears after three strokes).

Alternatives considered:

- **Defer the `onMount` init calls** (the audit item's suggestion) — measured
  immaterial (~4 % of the task); rejected.
- **Keep static imports, gate the templates behind `{#if}` at idle** — skips
  hydration but the overlay code still evaluates inside the load task; a
  dynamic import removes both.
- **Mount all six in one idle callback** — measured: it just relocates a
  ~250 ms long task to ~2.2 s, where it would jank a stroke already in
  progress.
- **Mount every dialog on first open** — defeats warms that exist precisely so
  the first open paints instantly (the Coloring Book's cover-thumbnail
  prefetch, ADR-0045).

## Decision

The six boot-hidden overlays live in one lazy chunk,
`web/src/lib/components/bootHiddenOverlays.ts`, which `+page.svelte` imports
inside a `requestIdleCallback` (setTimeout fallback — iOS lacks rIC, see
`docs/COMPATIBILITY.md`). Five of them then mount **one per idle callback**
(`{#each overlays as Overlay (Overlay)}`), so no idle slice forms its own long
task.

The **Parent Center dialog is the exception**: at ~200 ms mounted (throttled)
it is too heavy even for an idle slice, so it mounts on its **first open** —
`ui.parentCenterOpen` latches `parentCenterWanted`, and the mount cost hides
inside the tap-to-fly-in moment (a parent gesture, not a toddler one). Its
always-visible corner trigger was extracted to `ParentHelpButton.svelte` so
the button itself stays eagerly rendered.

Why late mount is safe — and the invariant to keep: **every overlay must be
fully state-driven.** The `modalDialog` action reads its `ui.*Open` flag on
its first `$effect` run, so a tap that lands before the chunk arrives still
shows the dialog the moment it mounts. An overlay that captures events or
reads DOM at mount time would break under this pattern.

Measured (`npm run perf:mount`, phone, 4× CPU + Slow-4G): load long task
471–508 ms → 256–325 ms, DCL 785 ms → ~400 ms, and no long tasks after load.

## Consequences

- \+ ~150–250 ms less main-thread blocking in the Lighthouse TBT window on a
  throttled phone; the canvas is stroke-ready sooner.
- \+ A place to put the *next* boot-hidden overlay: add it to
  `bootHiddenOverlays.ts` and the idle queue in `+page.svelte`, and it stays
  off the load path by construction. Re-importing one eagerly in
  `+page.svelte` silently reverts the win — `npm run perf:mount` is the
  regression check.
- − The Parent Center's first open pays its mount (~50 ms on a real phone,
  masked by the fly-in animation). Deliberate: a parent-facing, once-per-visit
  cost.
- − The overlays' SSR markup is gone (they client-render at idle). All were
  invisible at boot, so nothing visible changed — but a future overlay that
  *does* paint at boot (like the Parent Help button) must stay out of this
  chunk, as the button's extraction shows.
- − One more chunk request at idle; on repeat visits it's served from the
  service-worker precache like every other asset.
