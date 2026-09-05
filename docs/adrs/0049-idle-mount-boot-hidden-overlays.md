# ADR-0049: Idle-Mount the Boot-Hidden Overlays (Settings on First Open)

**Status:** Active **Date:** 2026-07

## Context

The Lighthouse audit's last open item was phone first-visit **Total Blocking Time of 360–560 ms** —
the main thread is busy while the canvas comes up. A `perf:mount` profile (phone viewport, 4× CPU
throttle, Slow-4G) showed the entire cost is one ~470–510 ms hydration long task, and per-call
`performance.measure` instrumentation ruled out the suspected lever: `+page.svelte`'s `onMount`
calls (`initPWAUpdates`, `hydrateApiKey`, `initInstallPrompt`, …) total **~18 ms** of it. What
actually filled the task was evaluating and hydrating the six overlays that are always invisible at
boot: Color Picker, Coloring Book Picker, Settings, AI prompt, AI result, and the Install Banner
(which only appears after three strokes).

Alternatives considered:

* **Defer the `onMount` init calls** (the audit item's suggestion) — measured immaterial (~4 % of
  the task); rejected.
* **Keep static imports, gate the templates behind `{#if}` at idle** — skips hydration but the
  overlay code still evaluates inside the load task; a dynamic import removes both.
* **Mount all six in one idle callback** — measured: it just relocates a ~250 ms long task to ~2.2
  s, where it would jank a stroke already in progress.
* **Mount every dialog on first open** — defeats warms that exist precisely so the first open paints
  instantly (the Coloring Book's cover-thumbnail prefetch, ADR-0045).

## Decision

The six boot-hidden overlays live in one lazy chunk, `web/src/lib/components/overlayChunk.ts`, which
the `mountBootHiddenOverlays()` pump in `web/src/lib/boot/bootHiddenOverlays.ts` imports inside a
`requestIdleCallback` (setTimeout fallback — iOS lacks rIC, see `docs/COMPATIBILITY.md`). Five of
them then mount **one per idle callback** (`{#each overlays as Overlay (Overlay)}`), so no idle
slice forms its own long task.

The **Settings dialog is the exception**: at ~200 ms mounted (throttled) it is too heavy even for an
idle slice, so it mounts on its **first open** — `settingsModal.open` latches
`settingsModalEverOpened`, and the mount cost hides inside the tap-to-fly-in moment (a parent
gesture, not a toddler one). Its always-visible corner trigger was extracted to
`SettingsButton.svelte` so the button itself stays eagerly rendered.

Why late mount is safe — and the invariant to keep: **every overlay must be fully state-driven.**
The `modalDialog` action reads its `ui.*Open` flag on its first `$effect` run, so a tap that lands
before the chunk arrives still shows the dialog the moment it mounts. An overlay that captures
events or reads DOM at mount time would break under this pattern.

Measured (`npm run perf:mount`, phone, 4× CPU + Slow-4G): load long task 471–508 ms → 256–325 ms,
DCL 785 ms → ~400 ms, and no overlay-mount long tasks after load. A 2026-07-14 regression run
recorded two separate post-load tasks (67 ms and 110 ms, about 77 ms blocking total), dominated by
the intentionally idle `AudioContext` warm-up that keeps the first stroke audible; the canvas's
measured resize was 9.2 ms. That is outside this overlay decision and remains preferable to moving
context creation onto the child's first pointerdown.

## Consequences

* \+ ~150–250 ms less main-thread blocking in the Lighthouse TBT window on a throttled phone; the
  canvas is stroke-ready sooner.
* \+ A place to put the *next* boot-hidden overlay: add it to `lib/components/overlayChunk.ts` and
  to the idle queue in `lib/boot/bootHiddenOverlays.ts`, and it stays off the load path by
  construction. Re-importing one eagerly in `+page.svelte` silently reverts the win —
  `npm run perf:mount` is the regression check.
* − Settings' first open pays its mount (~50 ms on a real phone, masked by the fly-in animation).
  Deliberate: a parent-facing, once-per-visit cost.
* − The overlays' SSR markup is gone (they client-render at idle). All were invisible at boot, so
  nothing visible changed — but a future overlay that *does* paint at boot (like the Settings
  button) must stay out of this chunk, as the button's extraction shows.
* − One more chunk request at idle; on repeat visits it's served from the service-worker precache
  like every other asset.

## Amendment (2026-08): Settings joins the idle pump, staged

The first-open exception above priced SettingsModal as one ~200 ms mount — all eleven section bodies
in a single task. The staged wide-pane fill (issue #910, PR #1124) changed that shape: the modal now
mounts with its shell plus the two above-the-fold sections, and every further section is an
independent slice of work. That dissolves the reason for the exception, so Settings now mounts
**closed** as the idle queue's own final slice (after every cheap overlay is in), and `WideShell`
keeps prewarming the pane one section per idle slice until it is whole. Mounting alone is not
enough: a closed `<dialog>` is `display: none` by UA rule, so the prewarmed subtree would carry no
computed styles or layout boxes and the first `showModal()` would pay all of that on the tap —
measured (same machine, same harness, 4× throttle) as a ~186 ms first-open long task against ~52 ms
on a reopen. The closed Settings card therefore stays **laid out but hidden** (`visibility: hidden`
overriding the UA's `display: none`, in `SettingsModal.svelte`), which pays the style and layout at
idle and roughly halves the first show, to ~96 ms — for a modest tax on later edges (~73 ms
reopens), since each open/close now flips visibility across the subtree. The residual first-show gap
over a reopen is the open edge's own restyle plus the subtree's first paint, which no hidden state
can pay (an idle near-invisible "render flash" was probed and reached ~75 ms — not worth the
input-swallowing frame it costs). The tap-before-idle path is unchanged: `settingsModal.open` still
latches the mount the moment the chunk lands, and that tap runs the original open-time frame-paced
fill.

### Physical-iPad follow-up (PR #1124 review): honest idle, staged presentation

The shipping iPad path exposed two things the desktop numbers could not. First, `scheduleIdle`'s iOS
fallback was a bare 200 ms `setTimeout` — not idleness at all — so the prewarm's work landed inside
the post-boot interaction window and failed the physical-device idle frame gate
(`npm run perf:ios:xcuitest:actions`). The fallback is now cooperative (`lib/idle.ts`): it requeues
while a pointer is down, input is recent, or the latest frame gap ran long, and each prewarm slice
is one section's construction and nothing more (the closed mount starts empty). Second, revealing a
fully prewarmed pane put its entire first paint on the open edge, degrading the fly-in (33 ms post
P95 / 45 ms max against the 20/33.5 gates). Presentation is therefore staged separately from layout:
while closed every section is laid out but `visibility: hidden`, the fold paints one frame after the
flip (inside the fly-in's launch-scale moments), the rest reveal one section per frame after the
animation lands — with one breathing frame so `animationend` cleanup is not stacked on the heaviest
reveal — and sections re-stage one per idle slice after a close. Hiding the closed card by `opacity`
instead was measured and rejected: WebKit keeps painting inside an opacity-0 card, which moved the
paint bill onto the idle slices (53 ms) and the close edge (39 ms) for a measured ~3 ms open-edge
gain.

Measured end state (iPadOS 26.5, 120 Hz, warmup + 3 scored): idle 17 ms P95 / 26 max PASS, close
18/26 PASS, open 21 P95 / 25 max — two irreducible ~21-25 ms frames remain (the `showModal` flip
itself, paint-independent by the opacity A/B, and the heaviest section's reveal), so `open
Settings`
carries a **documented 26 ms P95 allowance** in `tools/perf/lib/action-stats.mjs`
(`IOS_ACTION_FRAME_P95_ALLOWANCES_MS`, scoped to the calibrated physical-iOS capture and recorded
into each capture as `gateAllowances` — ADR-0090's amendment) — an accepted exception, not a
loosened gate: the same change halved the worst open frame against the tap-mount baseline (25 ms vs
47 ms) and removed its mid-animation 41-45 ms paint stalls, and a regression past the allowance
still fails. On desktop the staged open eliminated the first-open long task outright (0 long tasks,
shown in 18 ms vs 13 ms reopens, 4× throttle).

Two readings shift with this: `npm run perf:web:settings` now measures what the tap actually is
after this change — **first-show latency on an already-warm dialog, scored against a reopen in the
same session** (the first-open-over-reopen gap is the residual first-render cost above, tracked so a
regression shows up as the gap growing; its ready selectors are gated on `[open]` since the warm
pane satisfies the bare selector before any tap) — and the `perf:mount` "no overlay-mount long tasks
after load" claim now tolerates the staged Settings slices at idle — each sized to a
shell-plus-two-sections start and single sections after, not the ~200 ms task that earned the
exception. `web/tests/settings-mount.spec.ts` pins the prewarm (fills closed, never shows the
dialog, first open reports not-busy).

## Amendment (2026-08): foreground demand outranks background residency

Fresh discrete-action attribution exposed a failure the full sweep's leading idle control had
masked: a genuinely early action could arrive before the background queue drained. The requested
dialog then waited behind unrelated residents, and the queue continued inserting unrelated hidden
subtrees while the visible dialog presented. On an iPad mini simulator, an early Coloring Books
request waited 437 ms for its own mount, a 42 ms frame landed immediately before the dialog
animation, and unrelated mounts continued at the iOS fallback's approximately 232–240 ms cadence.

The single lazy chunk remains the startup boundary. Once loaded, its residents are keyed and
mount-once. A state-driven request mounts the demanded resident first, skipping its background
position; a request that beats the initial idle callback starts the same memoized import directly.
AI Result also demands Waiting Polaroid first, preserving the only return path from a minimized
generation. The background queue uses the same idempotent mount owner, skips residents fulfilled by
demand, retains its canonical order with Settings last, and mounts one resident per slice.

Only that unrelated background queue receives the stronger interaction-quiescence gate. It tracks
pointer, click, keyboard, and wheel activity on both `requestIdleCallback` and iOS fallback paths,
requires a deliberate pause, and verifies two in-budget animation frames before each mount. A new
demand invalidates an already-scheduled background generation before mounting, then starts a fresh
quiet wait. Generic `scheduleIdle()` callers — including Settings' frame-paced section staging —
retain their established timing.

The startup mount profiler now starts its bounded settle after the `load` event instead of waiting
for global network-idle. Spaced background residents intentionally initiate image prefetches; making
their completion a hidden precondition could time out before the trace's explicit observation window
began. The settle window is ten seconds so the deferred work remains inside the trace rather than
being shifted beyond it.

## Amendment (2026-09): responsive shell reconstruction is prewarming

The hidden Settings card remains laid out, so replacing its responsive shell during rotation pays
construction and style recalculation even while the child is looking at the drawing. Closed-shell
media-query changes therefore use the existing idle scheduler. The wide and compact matches are read
in one operation: applying them independently can transiently construct the wide pane while a phone
is moving between the hub and compact shells.

Foreground demand bypasses this scheduling. Opening Settings cancels pending work and reads the
current viewport immediately; an open dialog or active button-size preview continues to follow
viewport changes synchronously. Slider teardown releases its active preview state when a shell
replacement interrupts a drag, while closing the dialog during a still-mounted drag does not end
that preview prematurely.

This preserves the laid-out prewarm rather than moving all construction to the next open. Idle
scheduling does not make construction free or guarantee that a callback fits a frame. The physical
control, provisional treatment, trace limitations, and committed recapture belong in
[`2026-09-05-android-settings-shell-rotation.md`](../scratchpad/perf/2026-09-05-android-settings-shell-rotation.md).

## Escape hatch if the overlay set grows heavier

The single barrel chunk (`CVCStUCq.js`, ~56 KB) evaluates all six overlays in one synchronous task
when the idle `import()` resolves. That is fine **today** because the only heavy member is
SettingsModal (~42 KB, ~75 % of the chunk) and its mount is staged across idle slices by the
amendment above; the other five are ~1.6 KB gzip each, so the co-evaluation never forms a >50 ms
task in a `perf:mount` trace. If a *second* SettingsModal-scale overlay is ever added to the barrel,
that one eval would start reliably crossing the 50 ms long-task line at idle.

The documented fix at that point — measured neutral now (2026-07), so **not adopted yet**: change
`lib/components/overlayChunk.ts` from static re-exports to a list of per-component lazy loaders
(`() => import('./X.svelte')`) and have the pump walk them **one loader per idle callback**, so each
overlay's chunk loads, evaluates, and mounts in its own slice. Cost: one idle request per overlay
instead of one for the set (precached on repeat visits). Verify with `npm run perf:mount` that no
per-overlay slice exceeds ~50 ms before adopting it.
