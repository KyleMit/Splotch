# Handoff — crayon brush re-architecture (post-ADR-0066)

> 2026-07-21 · branch `claude/crayon-brush-architecture-1cno0i` · Replace the replay-era crayon
> renderer with a blit-commit + soft-alpha deposit-dab architecture; proposal accepted for handoff,
> implementation not started.

## Objective & non-goals

**Objective:** re-architect the crayon brush (ADR-0065) to exploit what snapshot undo (ADR-0066)
made legal — fractional alpha, nondeterminism, pixels-as-truth — closing the five visual gaps the
comparison sheet documents while keeping the shipped acceptance behaviors: subtractive color mixing,
fill noise, hue/shade variance, and progressive deepening both mid-stroke and stroke-over- stroke.

**Non-goals:** no WebGL/WebGPU renderer; no change to undo/eraser/export machinery (already
raster-shaped); no kid-facing crayon button (still the deliberate ADR-0065 follow-up); no change to
the magic brush or pen.

## The proposal

The current brush is still shaped end-to-end by the bit-identical-replay contract ADR-0066 deleted:
binary tooth alpha, one flat rgb per color, stored per-pass seeds, phase-shift-instead-of- depth
buildup. The redesign is one inversion plus one substitution:

1. **Commit = blit, not fold.** Hold the crayon pass buffer in **paper space**. At pass close, stamp
   it into the paper raster with the *existing* two-blit darken-min mix
   (`strokeOps.ts:flushCrayonBuffer`). At commit there is nothing to re-render — live pixels are the
   committed pixels. This deletes the last determinism requirement (live-equals-fold), and with it
   the seeds, the binary-alpha constraint, and the idempotence machinery. Preserve the magic-sheet
   pending window exactly as ADR-0066 does (defer the fold-into-paper while the sheet is undecoded).
2. **Deposit accumulates as fractional alpha — the alpha ramp IS the deepening ramp.** Replace
   pattern-filled path ops with soft-alpha **dab stamps** along the polyline (spacing ~⅓ stroke
   width), sprites baked from the existing value-noise fields in `crayonBrush.ts`. The key trick:
   dab rgb = crayon color darkened ~10%, at low alpha (~0.15). Then a grazing pass reads as a
   translucent tint over paper; overlap *within* a stroke accumulates opacity toward the darker
   sprite color (mid-stroke deepening, no pass split required); a second stroke re-accumulates over
   stamped wax (new-stroke deepening), kept convergent by the darken-min stamp. An optional `deepen`
   knob `min(S, k·D)` in the stamp gives a bounded darkening floor: the fixed point is
   `(1−m)·c / (1−m·k)`, so it can never compound into mud.
3. **Texture upgrades now legal:** rotate/stretch dabs to the path tangent (directional streaks);
   modulate dab alpha by a low-frequency blotch field (pressure blotches); soft sprite edges
   (feathered crumbly rims); `Math.random` sprite-variant jitter (no stored seeds).

**Keep unchanged:** `CrayonPassTracker` (its role shifts from phase-bumping to mix-stamp
granularity), the darken-min two-blit stamp and the two live overlay canvases + `isolation:
isolate`
preview, warm-tiles→warm-sprites, and all undo/eraser/resize/export machinery.

**Perf framing (honest):** the per-op hot path is *not* the bottleneck (ADR-0065 measured 0.086 ms
avg vs ≲2 ms budget). The wins are: commit fold's op re-render disappears (helps the open ADR-0066
pointerup device gate), the double per-op overlay paint can become two dirty-rect `drawImage`s of
the paper-space buffer per frame, and the determinism machinery is deleted rather than optimized.

**Landing order** (each step A/B-able via `setCrayonParams`, scoreable against the committed
references):

1. Blit-commit with zero visual change — frees the constraint.
2. Soft-alpha tooth (fractional alpha, translucent thin deposit).
3. Darkened-sprite deposit deepening (+ optional convergent `deepen` knob).
4. Directional dabs + blotch field.

Step 1 alone justifies an ADR amending 0065 (use `/create-adr` once direction is confirmed).

## State

Branch `claude/crayon-brush-architecture-1cno0i`, pushed. No PR. No engine code touched yet — the
landed commit is the evidence base only:

| sha       | what                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c3dd163` | Stage-6 macro references + `vs-current.html` comparison sheet + its generators (`capture-current.mjs`, `build-compare-sheet.mjs`) + README runbook |

Files touched:
`tools/asset-gen/crayon-brush-samples/{samples,build-sheet,build-compare-sheet,capture-current}.mjs`,
`tools/asset-gen/crayon-brush-samples/README.md`,
`artifacts/crayon-brush-samples/{index,vs-current}.html`,
`artifacts/crayon-brush-samples/6-macro-*.webp`, `artifacts/index.html`.

## Decisions made (and why)

* **Blit-commit over patching the fold** — re-rendering ops at commit is the only remaining reason
  the brush must be deterministic; removing the re-render removes the constraint class, not one
  symptom.
* **Deposit via darkened-sprite alpha accumulation over an explicit deposit-field + colorize LUT** —
  a per-pixel LUT/threshold pass on canvas2d needs readbacks or awkward composite tricks; letting
  source-over alpha accumulation do the transfer needs zero new pixel machinery.
* **Keep darken-min mixing verbatim** — `min(c,c)=c` same-color exactness is what makes strong
  mixing shippable; the references confirmed the color result is right (the gap is texture, not
  hue).
* **Comparison sheet committed to `artifacts/` rather than left in the session** — repo convention
  (ADR-0059) and it's the acceptance record the A/B steps will be scored against.
* **Did not file the `/dev/engine` vite-dev SSR bug or fix it** — user hasn't said go. Workaround
  documented in the samples README (use the production build; minification DCEs the module-scope
  `window` read that crashes dev SSR at `web/src/routes/dev/engine/+page.svelte:32`).

## Unverified assumptions

* The darkened-sprite accumulation model produces the reference look in practice — derived on paper,
  never rendered. Step-2/3 prototypes must be judged against
  `artifacts/crayon-brush-samples/vs-current.html` scenes by eye.
* Dab stamping cost ≈ current pattern-stroke cost — argued from small-sprite `drawImage` behavior,
  not measured. Run the `profiling` skill's brush-perf harness before/after.
* A paper-space pass buffer previews correctly through the view transform with two dirty-rect
  `drawImage`s per frame (rotation-locked paper, ADR-0050, is the case to test).
* The magic-pending deferral composes cleanly with blit-commit (reasoned from ADR-0066's pending
  fold; not prototyped).
* `engine.spec.ts` constant-hue and spatial-stability guards can be re-bounded (allow *bounded*
  deepening) without losing their regression value.

## Done & verified

* Current-brush captures rendered through `/dev/engine` on a **production build** (`npm run build`
  * `PUBLIC_ENABLE_DEV_HARNESS=true npm run preview`) — the five gap claims come from looking at
    those renders next to the references, committed in `vs-current.html`.
* `vite dev` 500s on `/dev/engine` (`window is not defined` during SSR) — reproduced and confirmed
  the production build serves it 200.
* `npm run format:check` passed on the committed markdown; `artifacts:index` rebuilt; branch pushed
  (`c3dd163`).
* Gemini seam works (2 macro images generated with `GEMINI_API_KEY`); `to-webp.mjs` +
  `build-sheet.mjs` regenerated the contact sheet with 31 samples.

## Risks & next 3 steps

Risks: WebKit compositing of many small `drawImage` stamps unmeasured (ADR-0066's device gates are
still open on PR 442); soft-alpha deepening could overshoot and read muddy — the convergent-floor
math must actually be wired to the stamp, not just the dab.

1. **Step 1 (blit-commit):** make the crayon pass buffer paper-space and stamp it at pass close;
   delete the fold's crayon re-render path. Zero intended visual change — pin with a before/after
   capture (`capture-current.mjs`) and the engine E2E suite.
2. **Step 2+3 prototype behind `setCrayonParams`:** soft-alpha dab sprites + darkened-sprite
   deepening; A/B against `CRAYON_DEFAULTS` in `/dev/engine`, re-run `capture-current.mjs` +
   `build-compare-sheet.mjs` and judge by eye against the references.
3. **Measure:** `profiling` skill brush-perf run (4× throttle) before/after; then `/create-adr`
   amending ADR-0065 with whichever architecture wins.

## Reread first

* `docs/adrs/0065-crayon-brush-textured-wax.md` and `docs/adrs/0066-snapshot-undo-reinstated.md` —
  the constraint history this proposal cashes in.
* `web/src/lib/drawing/crayonBrush.ts` (fields, tiles, pass tracker) and
  `web/src/lib/drawing/strokeOps.ts:126-304` (pass buffer + two-blit stamp — the code Step 1
  rewires).
* `web/src/lib/drawing/engine.ts:536-560` and `:794-801` (pass-split + flush recording),
  `:1116-1136` (overlay wiring).
* `artifacts/crayon-brush-samples/vs-current.html` — the acceptance record (live copy at the
  crayon-brush-samples GitHub Pages page once merged).
* `tools/asset-gen/crayon-brush-samples/README.md` — the capture/compare runbook.
* Skills: `profiling` (brush-perf harness), `adrs`.
