# ADR-0080: Tests Observe the Engine's Committed Brush Mode, and Pace Their Own Strokes

**Status:** Active **Date:** 2026-07 **Amends:**
[0078](0078-playwright-worker-count-and-flake-tuning.md) (the Playwright tuning record)

## Context

ADR-0078 lowered the worker count and left four specs still flaking, with the magic brush's "rainbow
gradient" test the largest single local source. It also named the seam it could not build:

> Tests can only observe when the *button* changes, not when the engine commits the brush mode. A
> dev-harness signal for the engine's committed mode would retire the commit-order class outright;
> until then, affected specs carry redraw retries.

That framing came with a diagnosis attached — a **commit-order race**: the brush→engine toggle runs
in a Svelte `$effect`, so a stroke dispatched right after `pickBrush()` can commit under the
previous brush, invisibly, because "a canvas-fill count is immune — a pen stroke fills it too." Four
redraw loops existed to compensate.

Building the seam made the diagnosis testable for the first time, and two thirds of it turned out to
be something else. Three distinct mechanisms were separated by measurement:

**1. The mode race is real but was never the failure.** With the seam in place, a probe on every
failing reveal reported `magicActive: true`, `sheetUnready: false`, and a held gradient — the engine
was in the right mode every time. Dumping the painted pixels settled it: the dominant colour was the
page's sky (200,232,244), never the purple ink a pen pass lays down. No wrong-mode stroke was
observed at all, in any failure, across ~700 recorded reveals.

**2. The rainbow test's discriminator overlapped its own accept distribution.** The colour count was
quantized to 4 bits per channel and had to exceed 4. A rainbow reveal crosses only the slice of the
gradient its stroke spans, and the short post-clear stroke is the narrowest slice in the suite.
Measured over 45 samples per case:

| case                           | 4-bit buckets    | 6-bit buckets     |
| ------------------------------ | ---------------- | ----------------- |
| pen pass (what it must reject) | 1-3              | 1-3               |
| rainbow, first reveal          | min 5, median 12 | min 15, median 69 |
| rainbow, **post-clear** reveal | **min 3**, med 7 | min 7, median 33  |

So the reject and accept distributions *touched* at 4 bits: a correctly painted reveal scored 3-4
and failed. That is the whole of issue #658 — its two candidate readings (a too-tight settle window,
or an engine bug dropping the post-clear re-rasterize) are both wrong, and the retry-insensitivity
it documented follows: a redraw repaints the same held gradient, so every attempt scores the same
and runs out the same window.

Note the shape of the third column: **finer quantization does not move the pen side at all.** One
flat colour is one bucket however narrow the buckets are, and the 1-3 comes from anti-aliasing
rounding, which stays inside a 4-wide bucket.

**3. Strokes were being truncated, and the engine was right to do it.** At 8 workers a four-point
sweep sometimes painted only its start dot — 132 opaque px against 2314 for the full stroke, one
flat fill region, hence "flat". The cause is the app's own dropped-pointer heuristic
(`strokeMath.pointerWasResumed`): a sample more than `POINTER_RESUME_GAP_MS` (100ms) after the
previous one *and* farther than `POINTER_RESUME_JUMP_RATIO` (0.1) of the paper's shorter side reads
as a finger that lifted and set down, so the engine restarts the stroke there and never paints the
span between. The specs dispatched 160-200px hops on a 720px-tall paper — 2-3x the jump threshold —
and a starved worker easily spends 100ms between two `mouse.move` calls. The app was correctly
rejecting input that no real finger produces; the harness was producing it.

This is also what the eraser spec's decisive-looking evidence in ADR-0078 actually was. That record
reads "the failing values were discrete (132 vs ~2314 pixels), which said *wrong brush mode*, not
*too slow*". 132 px is the start dot of a truncated stroke, and the pixels are the page's colours,
not ink. The discreteness was real; the conclusion drawn from it was not.

## Decision

### 1. The engine exposes its committed brush mode, dev-harness-gated

`engine.committedBrushMode()` answers what a stroke started *now* would paint as, resolved with
`renderOp`'s precedence (magic outranks the eraser, which outranks crayon texture) rather than the
UI's exclusive-axis view — so it can never claim a mode the renderer would not honour. That
precedence is pinned by unit tests, including the flag overlaps only a mid-flush engine can hold.

`lib/boot/devHarnessSeam.ts` publishes it as `window.__committedBrushMode` behind
`devHarnessEnabled()` — the same `PUBLIC_ENABLE_DEV_HARNESS` gate the `/dev/*` routes use, now a
single exported predicate instead of an inline condition. It is installed as one of the drawing
route's `onMount` boot steps and removed by its teardown; a unit test asserts the closed gate
installs nothing, because "never ships to real users" is the property that matters.

`pickBrush()` then polls that mode instead of returning on the click. Every brush-button id in the
suite is a key of one map from id to expected mode, so the union closes at the call site.

**The seam is kept even though it fixed no measured failure.** It is what turned the commit-order
hypothesis from untestable to falsified, it makes `pickBrush()` deterministic by construction rather
than by luck, and it is the reason all four redraw loops could be deleted rather than merely
re-tuned. A test that cannot see the state it depends on had to guess; three of ADR-0078's four
falsified hypotheses were guesses of exactly that kind.

### 2. `dragStroke` paces its own samples inside the engine's jump threshold

The helper subdivides every hop with `mouse.move`'s `steps`, sized from `POINTER_RESUME_JUMP_RATIO`
**imported from `strokeMath`** — not a copy of 0.1 — times a 0.4 budget fraction. Only the jump half
of the resume predicate is under a test's control (a starved worker spends 100ms between moves
whatever the spec does), so that is the half the harness holds.

The 0.4 is sized for the worst mapping rather than the nominal one: the threshold is a fraction of
the *paper's* shorter side while the helper paces in CSS px across the *canvas*, and under a
rotation lock the paper is contain-fit into the canvas, so one CSS hop becomes a proportionally
larger paper-space jump (÷0.6 in the rotation specs' geometry). Two fifths keeps even that case
inside the threshold.

### 3. Redraw retries are gone; per-attempt polls stay

The four `redrawUntilPasses` sites and `MAGIC_REVEAL_MAX_ATTEMPTS` are deleted — with the mode
guaranteed before the stroke and the stroke no longer truncated, a redraw has nothing left to
rescue. The polls remain, for a different and still-real reason: a coloring page's fill sheet
decodes asynchronously, so a *correct* stroke reads flat until the fold-in repaint lands.

That retires ADR-0078 §2c (the attempt cap) entirely, including its measured attempt distribution —
those 10-of-328 second-attempt recoveries were the truncation, not the mode race.

### 4. Budgets sized from measured headroom

`install-banner`'s exit assertion had the thinnest headroom ratio in the suite, and mostly against
itself: ~4.6s of it is InstallBanner's fixed parting message plus shrink transition, which
contention cannot compress, inside a 10s budget that measured 5.0s at 8 workers. It is now 20s, and
the test is `test.slow()` because the whole test measured 17.7s there against a 30s default.

Its *appearance* assertion turned out to be thin for a different and more interesting reason, caught
by a full-suite run after this branch merged `main`. The banner is the last of five overlays the
idle pump mounts, one per `requestIdleCallback` **with no timeout option**, so its mount waits for a
genuinely idle frame however long that takes — and the third stroke, the one that makes the banner
eligible, is also what releases the deferred service-worker registration in the same flush, whose
~39 MB precache is precisely what keeps the page from going idle. That wait is thin by construction
rather than by inflation, which is why it survives isolation: the same test passes 20/20 at 4
workers alone and failed once in three full-suite runs. Also 20s now.

The lesson generalises past this spec: a budget covering an *idle-scheduled* mount is not a headroom
ratio at all, because `requestIdleCallback` promises nothing. Either wait generously or give the
callback a timeout.

Two un-retried opens against lazily-wired controls are now retried, per the flake checklist in
`.claude/rules/testing.md`: the colour picker in `flows-palette-brush` (`gotoApp` returns on the
prerendered canvas, so a click can land before the `scribbleTap` action exists and be lost outright
— the sibling keyboard test already opened it this way) and Settings' AI Art section in
`flows-settings` (the dialog mounts on first open, ADR-0049, and flies in).

## Consequences

\+ **The magic spec went from 8 failures in 250 to 0 in 250** at 8 workers — the amplifier setting
ADR-0078 used — with all four redraw loops removed. The eight were the calibration overlap and
truncation above; ADR-0078's own baseline at that setting was 4/200 *with* the retries.

\+ **The pacing fix is suite-wide.** Every spec that draws through `dragStroke` was dispatching
input the engine is designed to reject, so this removes a flake source from specs nobody had
attributed to it yet.

\+ **A false diagnosis is retired with evidence rather than left standing.** ADR-0078 §3's
commit-order class, its worked example, and the attempt cap built on top of it all traced back to
one reading of one pixel count. The probe that settled it (engine mode, sheet readiness, held
gradient, and the dominant painted colour, dumped at each failure) is the technique worth reusing:
read the *engine's* state at the moment of failure, not the assertion's.

− **The rainbow reveal's margin is measured, not proven, and it is asymmetric.** The measured
populations — a pen pass at 1-3 buckets, the narrowest reveal at 7 — leave a four-wide gap with no
centre, so no boundary splits it evenly. Accepting from 5 inclusive gives the reveal side two
buckets and the pen side one, and the spare bucket goes to the reveal side on purpose: that is the
tail that bit (#658), and its spread is real (a random gradient crossed by a short stroke) where a
flat pass is pinned near one bucket by construction. A gradient pool change, a shorter stroke, or a
different canvas size could still narrow it, and the failure mode would be a red test rather than a
silent pass.

− **Paced strokes cost wall clock.** A 180px hop becomes ~11 dispatched moves on a phone-sized
viewport, each a protocol round-trip. The install-banner spec draws eight of them, which is most of
why it now measures 17.7s at 8 workers. Reducing the round-trip cost would mean dispatching the
interpolation in one batch, which `helpers.ts` cannot do — it must stay CDP-free for WebKit
(`web/tests/CLAUDE.md`).

− **`committedBrushMode()`'s precedence is a second statement of `renderOp`'s.** They agree by unit
test rather than by construction; a change to op precedence that skipped the test would make the
seam lie about what a stroke would paint.

− **The seam is production-visible code that production never calls.** The gate is a runtime check
on dynamic public env, so the branch ships (a few lines) rather than being tree-shaken out.
`$env/static/public` would eliminate it but fails the build when the variable is unset, which is
exactly the deploy case.

## Reproducing

The measurements above come from three throwaway harnesses, all on the 4-core container profile
ADR-0078 records:

* **Distributions.** A temporary spec that draws the same strokes in pen mode, then as a rainbow
  reveal, then post-clear, logging `distinctOpaqueColors` at 4/5/6 bits per call; run at
  `--repeat-each=45`.
* **Failure state.** A temporary `window.__magicProbe` beside the seam returning
  `isMagicSheetUnready()`, the engine's `magicActive`, the held gradient, and the clear-path log,
  dumped from the spec at each failed reveal — plus the four most common opaque colours, which is
  what identified the brush.
* **Amplifier.** `npm run test:e2e -- flows-magic-brush.spec.ts --workers=8 --repeat-each=25`, the
  same 8-worker setting ADR-0078 measured its 16/200 → 4/200 against.
