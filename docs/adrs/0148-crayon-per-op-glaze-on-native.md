# ADR-0148: Native Crayon Applies the Glaze Per Op, Directly on the Tile

**Status:** Active — supersedes the native half of
[ADR-0147](0147-crayon-restamp-renderer-no-preview-planes.md) (web keeps restamp unchanged), retires
[ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md)'s preview planes on the Capacitor WKWebView,
and refutes ADR-0147's attribution of the plane pipeline's cost **Date:** 2026-08

## Context

ADR-0147 decided planes for native at 1.19–1.40% of in-contact frame time against a native pen floor
of 0.01–0.05% — crayon costing roughly 40× pen for what is visually a textured line. It also
recorded a measured 4× (0.20–0.46%) that was **rejected on appearance**: that pipeline painted
unmixed wax live and applied the glaze after the lift, and the correction at lift read as a colour
glitch rather than as ink drying.

The 2026-08-27 campaign (`docs/scratchpad/perf/crayon-native2-2026-08-27.md`) inverted the framing —
live-accurate mixed preview is the constraint, the frame budget is the variable — and began by
re-testing ADR-0147's own attribution, which held that the plane pipeline's cost was the
pass-cadence bake that stamps the buffer into the tile. Every part of that attribution failed:

* **The bake's blend mode is free.** Replacing `darken` + `source-over(1−mix)` with two plain
  `source-over` blits measured 1.21/1.44/1.55 against a same-session baseline of 1.10–1.87.
* **The bake's blit count is free.** Halving it to a single blit measured 1.26/1.46/1.60.
* **The bake's timing is free.** Deferring the bake past the lift while keeping the preview planes
  up measured 1.25/1.57/1.60. This one was instrumented rather than argued: naming each bake's call
  site showed **543 bakes landed deferred against 216 dragged back** by the next stroke arriving
  inside the settle, so 72% genuinely left the contact window and the number did not move.

Sorted by whether composited preview planes were present, every cell separates cleanly: **planes
present measures 1.21–1.87, planes absent measures 0.02–0.46** — across this campaign's probes,
ADR-0137's N6, and ADR-0147's own a3, a4 and T10. The planes are the cost. ADR-0147 had inferred the
opposite from three similar numbers taken across *different* pipelines (T2 1.50 ≈ a3 1.49 ≈ planes
1.24), which is the "an observation is not a mechanism" failure `docs/PROFILING-CAMPAIGNS.md` warns
about; ADR-0137 had already named this exact gap, noting its N6 "bounds the blend mode rather than
the cost of compositing two planes per tile."

That forces the mixed pixels onto the tile itself. Two ways to put them there were already measured
and rejected: restamp restores each op's rect from an under shadow and re-glazes, which is per-op
composited-tile blits (1.76–2.12% on native), and the deferred pipeline defers the mixing itself,
which is the appearance rejection above. The third is to paint the glaze per op — which the glaze
normally forbids, because `out = (1−m)·S + m·min(S,D)` compounds under a pass's overlapping ops.
Needing to be applied exactly once per pass is *why* an accumulation surface has to exist at all.

**A fully subtractive glaze was tried first and refuted at the device.** At `m = 1` the expression
collapses to `min(S,D)`, which is idempotent, so it can be painted per op with no accumulation
surface — and it measured 0.02–0.33%, the pen floor. A human drew on it and rejected it immediately:
idempotence means `min` is a **fixed point**, so blue over yellow stays green however many times a
child draws back over it, and the crayon reads as refusing to work. The shipped mix walks to the new
colour precisely *because* it is not idempotent (n passes give `S·(1−mⁿ) + mⁿ·D`). The
non-idempotence is the feature, and it is the same property that requires the expensive surface.

## Decision

**Native crayon applies the shipped glaze arithmetic per OP, painted straight onto the ink tile: no
accumulation buffer, no preview planes, and no canvas-to-canvas blit.** The `glaze-direct` mode in
`web/src/lib/drawing/crayonPassBuffer.ts` paints each op twice — `darken` at alpha 1, then the
crayon's own colour at `PER_OP_GLAZE_RETURN` — and `crayonFlush` becomes a no-op, since no pass
state exists to close. Selected from the same compile-time `CAPACITOR=true` signal as ADR-0146's op
granularity and ADR-0147's deposition fork (`engine.ts`). **Web is untouched and keeps restamp.**

`PER_OP_GLAZE_RETURN = 0.2944` is the load-bearing constant, and it names the **effective** return
over an op's fully-covered pixels rather than the alpha any one paint receives. `paintCrayon` fills
one shape per DENSITY BAND, so both steps run once per band: harmless for `darken`, since min is
idempotent, but the return is a lerp and compounds. Naming the per-paint alpha would make the real
glaze `1 − (1 − B)^bands` and tie it silently to `CrayonOptions.passes`; the per-band alpha is
instead solved back out of the effective value, so the appearance survives a band-count change. The
device tuning that set this drew two bands at a per-band 0.16, whose effective full-coverage return
is this value — the same pixels, restated in terms that do not depend on the band count. A pixel
inside only one band still receives only that band's share, which is inherent to per-band painting
without a union mask, and a mask needs a per-op blit onto the composited tile — the cost this
pipeline exists to avoid. It is **not** the pass-cadence `1 − mix`: a pixel covered by k overlapping
ops retains `1 − (1−B)^k` of the crayon colour, so reusing 0.45 per op reaches 75% after two ops and
~99% at hand speed — measured on the device as a crossing that kept its green only at the single-op
fringe. Solving `(1−B)^k = mix` for a hand-speed k brackets B near 0.06, which read as too green on
the device.

**0.16 was settled by drawing on the physical iPad**, cross-checked against a sweep that measures
each candidate's crossing colour against the web pipeline's across colour pairs and redraw depths
(`tools/perf/find-glaze-web-match.mjs`, and the proof sheet beside it). That sweep put the
fast-stroke optimum at 0.18 by inverting the same model — `k = ln(0.55)/ln(0.82) ≈ 3` overlapping
ops for its stroke geometry, which independently confirms the mechanism — and showed web's first
crossing at a blue channel of 153 against 121 for 0.10, i.e. 0.10 sat greener than the shipped web
appearance at first contact. Treat the formula as the bracket that found the range, not as a
derivation: recomputing it and "correcting" the constant would undo a human judgement.

The constant is **appearance-only**. A controlled A/B on the device measured 0.02 against 0.45 and
found the apparent 15× difference was session drift rather than glaze — the same 0.02 build re-run
at the end of the session measured 0.47% against its own earlier 0.03%. Per-op work is identical at
every value (two paints, the same pattern-fill count, only a blend coefficient differing), so this
value can be moved on looks alone without re-capturing.

Two invariants make the per-op form safe where it is not visibly different — **both hold for opaque
interiors and neither extends to antialiased edges**, which an earlier revision of this record
claimed and review refuted:

* **An opaque interior on blank paper is the wax exactly.** `darken` over a transparent backdrop
  yields the source, and the source over itself is the source. This is the dominant toddler case.
* **Same-colour buildup is exact in the interior.** `min(S,S) = S`, and coverage still accumulates
  because each pass's seed re-phases the tooth pattern into different pits.

**What that does not cover.** A partially covered EDGE pixel is blended once by each step, so its
coverage is not a fixed point and does not reproduce a single plain paint. Measured in WebKit
against one `source-over` paint of the same fractional-coordinate line: ~232 differing pixels over
blank paper (max channel delta 38) and ~233 over same-colour overdraw (max delta 69); Chromium
differs too. Those pixels are the wax's own tooth rim, they were judged on the device rather than
derived, and the correct statement is "the interior is exact and the rim is not", not
"byte-identical".

The distinction matters because the earlier claim was load-bearing here and rested on algebra alone.
The algebra is right about the composite ops and silent about coverage.

`crayonGlazeDirect.test.ts` pins the op sequence and alpha, pins that the pipeline issues zero
blits, and — separately from any pipeline — pins the convergence requirement as arithmetic, so a
future candidate cannot trade repeated-draw accumulation away without a red test.

## Consequences

\+ **The gap is eliminated, not shaved.** Physical iPad, installed Capacitor app, all fidelity-PASS
with `uncalibrated: []`: portrait 0.36/0.35/0.00/0.08/0.02 (median 0.08) against the same-session
plane baseline's median 1.33; landscape 0.01/0.03/0.05; pen control on the same build 0.00. Crayon
now sits at the native pen floor, and the ~40× brush-to-pen ratio is gone.

\+ **The whole preview-plane apparatus becomes dead weight on native** — two composited canvases per
live tile, the per-op mirror blit, the pass bounds, the bake, and the settle-order machinery around
it. Crayon deposits like any other brush.

\+ **ADR-0137's `ipad-device-web:crayon` exception is not affected, but the native 1.5% exception is
now unused headroom** and is a candidate for retirement on evidence rather than by argument.

− **Mix depth varies with stroke speed.** A pixel's mix depends on how many ops covered it, so a
fast swipe across existing ink leaves more of it showing than a slow deliberate stroke. The buffered
pipelines hold a single stroke flat by construction; this one cannot, and **no value of
`PER_OP_GLAZE_RETURN` removes it** — it is inherent to applying the glaze per op. Accepted on the
device on the grounds that it is how wax behaves, and it is the same mechanism that produces the
repeated-draw accumulation the buffered-once glaze also has.

− **Native and web now differ in appearance at crossings, not merely in pipeline.** ADR-0147 already
forks deposition per runtime, but those forks were byte-identical in output; this one is not. Web
keeps the uniform per-pass glaze at mix 0.55. The divergence is confined to pixels where a stroke
crosses *existing ink of a different colour* — blank paper and same-colour buildup match exactly —
and it is deliberate rather than overlooked. Closing it means either porting this pipeline to web
(where restamp already meets its gate, so the change would buy appearance consistency at unknown
cost) or accepting it; that decision is open.

− **The constant was set by eye and has no test that can fail on it.** Its value is a taste
judgement recorded in an ADR and a comment, which is weaker than the drift-guards this repo prefers.
A screenshot-diff gate over a crossing would close that, and does not exist.

− **The glaze is no longer "once per pass" anywhere in the native path**, so reasoning that assumed
the pass as the unit of mixing — including ADR-0065's buildup argument and ADR-0085's pass-tracker
splits — now describes only the web pipeline. The splits and checkpoints still re-phase the seed on
native and still matter for texture, but they no longer bound a mixing unit.
