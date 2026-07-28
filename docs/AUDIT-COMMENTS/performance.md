# Audit comments — Performance

8 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see the
README for what this archive is, the full run table, and the category index.

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### f3faf52fdd1e — [P4][performance] `pinchTextZoom.spread()` allocates an array on every pointermove

**Issue**

```ts
function spread(): number {
  const [a, b] = [...points.values()];
  ...
}
```

`spread()` is called from `onPointerMove` on every move event during a pinch, and each call spreads
the map iterator into a fresh array just to read the first two entries — a per-frame allocation on
the hot gesture path.

**Fix**

Replaced the array-spread destructure in spreadTracker.svelte.ts's spread() with two direct iterator
.next() calls, avoiding a per-pointermove allocation on the shared hot path used by both pinch
gestures. Behavior is unchanged (verified via existing spreadTracker/pinchTextZoom/pinchZoom unit
tests); check, unit tests, and eslint all pass clean.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082334155) · 2026-07-26
06:17:38 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 0850d9cb8c24 — [P3][performance] `measureSafeAreaInsets()` creates + appends + reflows a probe on every resize/orientation event

**Issue**

Each call does `createElement` → `appendChild` → `getBoundingClientRect` (a forced synchronous
layout) → `remove`. `layout.svelte.ts` calls it from `syncViewport`, which is wired to `resize`,
`orientationchange`, and `visibilitychange`. `resize` can fire many times per second during a
drag/rotate animation, so every burst churns DOM nodes and forces a reflow mid-frame — exactly the
kind of jank the `profiling` skill warns about.

**Fix**

Changed safe-area measurement to lazily create and retain one fixed invisible probe, reusing it for
synchronous measurements while preserving all four inset calculations. Added focused unit coverage
for probe reuse, retention, and returned inset values.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086078029) · 2026-07-27
00:12:46 UTC</sub>

### f5da1416e9c8 — [P4][performance] `playDrawSound` calls `preloadDrawSounds()` on every pointermove

**Issue**

`onDrawSoundCallback({ speed })` fires on every `pointermove` (engine line 905), and `playDrawSound`
starts with `preloadDrawSounds()`. Preload early-returns on `loadStarted`, but it's still a function
call + branch on the hottest path in the app (every move of every stroke). It reads as defensive
coupling — preload is already triggered from `DrawingCanvas.svelte:215` via `scheduleIdle` and on
the first `pointerdown`.

**Fix**

Tagged drawing-sound callbacks by stroke phase so only stroke starts initiate loading, while Parent
Center volume preview explicitly starts its own preload. Added focused coverage for failed-load
retries and uninterrupted gain updates on moves.

*Revised before approval:* Reformatted the volume-preview conditional in SoundSection so the
committed implementation conforms to the repository’s Prettier gate.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086081501) · 2026-07-27
00:13:28 UTC</sub>

### cae2c78051e7 — [P2][performance] `scoreEyeRings` and `findEyeCores` each re-run the ink mask + full region labeling on the same buffer

**Issue**

Both functions open with `await inkMask(sourceBuf)` then `labelRegions(ink, w, h)` — a full
4-connected labeling of every non-ink pixel at native resolution.
`bin/normalize-outline-strokes.mjs` (lines 225 + 277) and `bin/gen-coloring-outlines-fresh.mjs`
(lines 178-180) call *both* on the same page, so the most expensive step in the module — decode +
connected-component labeling of a multi-megapixel page — runs twice per candidate. `scoreEyeRings`
also re-walks the parent chain that `findEyeCores` already established.

**Fix**

Added a shared eye-page analysis and a combined `scoreEyes` operation so paired core and ring
scoring reuses one ink-mask and region-label pass. Updated both generators without adding core work
to their cheap paths, and locked the existing synthetic eye metrics with a one-label-pass
regression.

*Revised before approval:* Cached each buffer’s internal eye-page analysis so the ring-only skip
decision and subsequent combined scoring reuse the same decoded mask and region labels. Added a
regression covering the exact standalone-ring-then-combined sequence and proving it performs one
label pass.

*Revised before approval:* Moved parent-region lookup into the shared analysis as a lazy per-region
cache, so core and ring scoring reuse topology instead of repeating pixel walks. The lazy cache
preserves standalone-call efficiency by computing only the parent relationships each metric actually
needs.

**Adversarial review** — reviewer caught the following; addressed before approval:

* In `normalize-outline-strokes.mjs:209-218`, a non-forced source that passes solidity but fails the
  ring gate is analyzed first by `scoreEyeRings(source)` and again by `scoreEyes(source)`, so the
  thin-stroke/over-deep path still decodes and labels the same buffer twice. Reuse one labeled
  analysis for the skip decision and subsequent core scoring.
* `scoreEyes` still re-walks parent chains in `findEyeCoresFromAnalysis` and then again in
  `scoreEyeRingsFromAnalysis` (`tools/asset-gen/lib/eye-fill.mjs`), leaving the original finding’s
  second redundant traversal intact; compute/reuse parent relationships or depths across both
  metrics.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086090127) · 2026-07-27
00:15:12 UTC</sub>

### 534c12aa17f0 — [P3][performance] `outlineMatch` always encodes a 512×512 overlay PNG even when the caller discards it

**Issue**

`outlineMatch` allocates `rgb = Buffer.alloc(MASK_W*MASK_W*3, 255)`, paints it throughout the scan,
and always `await sharp(rgb…).png().toBuffer()` before returning. But
`bin/check-coloring-drift.mjs:55-60` uses `overlay` only under `if (values.overlay && failed)`, and
the generator gate at `bin/gen-coloring-fills.mjs:199` uses `keep`/`localKeep` for the pass/fail
decision. Every gate evaluation pays a full PNG encode purely for a diagnostic image most calls
throw away — on the hot batch path.

**Fix**

Made outline overlays opt-in so normal drift audits skip the diagnostic allocation and PNG encoding,
while requested audit overlays and generated review overlays remain unchanged. Added coverage for
the default null result and opt-in PNG buffer contract.

*Revised before approval:* Moved fill overlay generation after candidate selection so retry attempts
only compute scores and exactly one review PNG is encoded per winner. Restored explicit overlay
requests for the chalk and outline-normalization consumers, with CLI coverage for the deferred fill
overlay.

*Revised before approval:* Deferred drift-audit overlays until a page fails and chalk/normalization
overlays until the winning candidate is selected, eliminating PNG work for successful pages and
discarded retries. Added audit CLI coverage proving `--overlay` renders only failed-page
diagnostics.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `gen-coloring-fills.mjs` still passes `{ overlay: true }` for every attempted candidate, so the
  hot batch path continues encoding and discarding PNGs; score attempts without overlays and
  generate the review overlay only for the selected candidate.
* `gen-coloring-chalk.mjs` and `normalize-outline-strokes.mjs` still consume `fwd.overlay` from
  default `outlineMatch` calls, which now return `null`, causing their `sharp(best.overlay)` writes
  to fail; request overlays at those call sites.
* `tools/asset-gen/bin/check-coloring-drift.mjs:56` still encodes an overlay for every successful
  page when `--overlay` is set even though only failed pages write it; score first without an
  overlay, then request one only after `failed` is known.
* `tools/asset-gen/bin/gen-coloring-chalk.mjs:367` and
  `tools/asset-gen/bin/normalize-outline-strokes.mjs:265` request overlays inside retry loops, so
  every discarded candidate still pays the allocation and PNG encode; request the overlay only for
  the selected `best` candidate, as `gen-coloring-fills.mjs` now does.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086090466) · 2026-07-27
00:15:17 UTC</sub>

### 10cbecfa4378 — [P3][performance] Every night scorer independently decodes and resizes the same source buffer

**Issue**

`scoreNightness` resizes source to width 384, `scoreDrift` to 512, `scoreLineColor` to 512,
`outlineMatch` to 512×512, `scoreEyeFill` decodes at native. When the dark-fill gate runs all of
them on one candidate (`bin/gen-coloring-fills-dark.mjs`), the same source webp is decoded from
scratch 4-5 times, and `scoreDrift`+`scoreLineColor` both resize source to 512 independently.
`sharp` decode+resize is the dominant cost per gate.

**Fix**

Added a shared 512px grayscale source preparation helper and reused its raw pixels and dimensions
for drift and line-color scoring in each generated take. Buffer-only scorer calls still prepare
their own source, while nightness retains its direct 384px path.

*Revised before approval:* Reused the exported `OUTLINE_MASK_SIZE` width across outline matching,
drift, and line-color scoring. Added regression coverage that exercises the prepared-source path,
verifies its 512px dimensions and scorer results, and confirms the source buffer is passed to Sharp
only once across both scorers.

*Revised before approval:* Extracted the complete drift/nightness/line-color sequence into
`scoreNightFillGates` and wired the generator’s per-candidate path through it. The regression now
exercises that production helper and verifies exactly two source pipelines: one shared 512px
preparation plus the separate calibrated 384px nightness decode.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/lib/night-scores.mjs:21` introduces a second private 512px constant while
  `outline-match.mjs` retains `OUTLINE_MASK_SIZE`, leaving the finding’s requested DRIFT/LINE/MASK
  working-width unification incomplete; use one shared width export.
* No test exercises the production `prepareSourceScore` reuse path or asserts that the source is
  decoded at 512px only once for drift and line-color scoring, so the optimization explicitly
  required by the finding can regress while the current buffer-only tests remain green.
* The new sharp-count test manually passes `preparedSource` to both scorers without exercising
  `gen-coloring-fills-dark.mjs`, so removing the generator’s reuse wiring would restore duplicate
  source decodes while the test remained green; cover the actual per-candidate gate path or an
  extracted helper used by it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086091155) · 2026-07-27
00:15:25 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### 6ddec6cd3a54 — [P4][performance] `ringBands` recomputes the dilation from the base mask at r=1,2,3 instead of growing incrementally

**Issue**

```js
for (let d = 1; d <= maxD; d++) {
  const grown = dilateMask(mask, w, h, d);   // full radius-d dilation from scratch
  …
  prev = grown;
}
```

Each iteration runs a fresh separable dilation of radius `d` over the whole page; the r=3 pass
redoes the work of r=1 and r=2. Three full-page morphological passes where one incremental
single-pixel dilation per ring (reusing `prev`) would do.

**Fix**

Changed `ringBands` in tools/asset-gen/lib/night-halo.mjs to dilate `prev` by radius 1 each loop
iteration instead of re-dilating the original mask by radius `d`, cutting redundant dilation work
(box dilation is associative, so the output is bit-identical). Unit tests, eslint, and type-check
all pass.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — the equivalence claim was checked empirically rather than taken on the
reviewer's word, since a metric change here would silently shift halo scores. `dilateMask` is
separable box morphology (a square/Chebyshev structuring element), which decomposes: *d* successive
3×3 dilations equal one (2*d*+1)² dilation, and the x/y passes commute. Differential-tested old vs
new over 4320 cases — grids from 1×1 to 40×31, densities 0→1, maxD 1–5, including forced
boundary-touching masks where the out-of-bounds handling could have diverged. Zero mismatches.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086242292) · 2026-07-27
00:49:33 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### ea09cd0985f4 — [P3][performance] Every swatch element is captured into `$state`, but only the custom swatch's ref is read

**Issue**

`let swatchEls = $state<Record<string, HTMLButtonElement>>({})` receives a `bind:this` from every
palette button, but the only consumer is `selectCustomColor` reading `swatchEls[CUSTOM_SWATCH]`. All
ten color-swatch refs are stored into a reactive `$state` record nothing reads, causing "needless
proxy writes on mount/trim". Proposed binding only the custom swatch into a single variable.

**State at triage (2026-07-27):** Still present, shifted a few lines:
`web/src/lib/components/ColorPalette.svelte:23` (the `$state` record), `:133` (per-swatch
`bind:this`), `:149` (custom-swatch `bind:this`), `:80` (the sole read, inside `selectCustomColor`).
`rg swatchEls` confirms those four sites are the only uses.

The perf claim does not hold up: …

**Fix**

Replaced the palette-wide reactive swatch-reference record with a single plain custom-swatch
reference and removed the unused static swatch bindings. The picker retains its mounted-button
anchor, nullable fallback, and existing invocation order.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows-palette-brush.spec.ts tests/webkit-smoke.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099947066) · 2026-07-28
04:26:30 UTC</sub>
