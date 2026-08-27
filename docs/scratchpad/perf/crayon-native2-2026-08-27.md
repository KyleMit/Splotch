# Crayon native (WKWebView) campaign 2 — 2026-08-27

Sequel to `crayon-native-campaign-2026-08-26.md`, which found a 4× native win and had it **rejected
on appearance**. That campaign's own closing note names the framing error it made, and this campaign
inverts it.

## The constraint, stated first because it prunes the space

**The live preview must show the mixed, glazed appearance while the finger is still down.** The
frame budget is the variable; appearance is not a concession to be checked at the end.

Campaign one's winner (`deferred`, 1.24% → 0.20–0.46%) painted unmixed opaque wax live and applied
the subtractive glaze after the lift. A human drew on it and reported a visible shift as the stroke
landed — bright wax darkening toward the background, reading as a colour glitch rather than as ink
drying. Disqualifying for a two-year-old's drawing app whatever the frame numbers say.

So every idea below is screened against live-accurate preview **before** it earns device time, and a
promising candidate goes in front of a human on the device early in its life, not after it wins.

## Ground truth inherited (do not re-measure)

Target: physical iPad `00008103-0006202E3CF1001E`, installed Capacitor app, WKWebView. Comparative
A/B only — gate-class, not gate-scored (ADR-0144).

| Cell                                     | lost %           | read                                        |
| ---------------------------------------- | ---------------- | ------------------------------------------- |
| `planes` (shipped baseline)              | 1.24 (1.17–1.38) | the number to beat                          |
| native pen                               | 0.01–0.05        | the floor                                   |
| a1 no splits/checkpoints                 | 1.67             | WORSE — fewer, larger bakes lose            |
| a2 + single density pass                 | 1.80             | WORSE                                       |
| a3 + no mirror plane                     | 1.49             | WORSE — planes are not the cost             |
| a4 + no planes, direct paint             | 0.02             | = pen floor, no glaze at all                |
| a5 + flat colour                         | 0.02             | paper-tooth pattern is free                 |
| T1B deferred + per-pass reads            | 2.81             | reads are expensive when work is unflushed  |
| T2 deferred, close-stamps kept, no reads | 1.44–1.56        | isolates the bake at ~1.4 points            |
| T4 a4 + buffer writes only               | 0.02–0.14        | offscreen writes are free                   |
| T7 stroke-cadence deposition             | 3.0              | WORSE                                       |
| T8 post-lift stamp, no flush             | 3.5              | WORSE — cost relocated to next undo capture |
| T9 under from undo patch                 | 1.74–1.81        | free under-source, still bakes in contact   |
| T10 T9 + forced 1-px flush               | **0.30–0.46**    | the 4× — **REJECTED ON VISUALS**            |
| `restamp` (web's winner) on native       | 1.76–2.12        | worse than planes                           |

**Cost model, derived by ablation and explicitly NOT traced.** A 75-second Time Profiler run over a
19-stroke native session found no readback stack. Everything below is "measurements are consistent
with", never "the cause is".

* Paper-tooth pattern strokes: free.
* Detached (offscreen) canvas writes: free.
* Painting directly onto the composited tile: free (a4 = pen floor).
* **A canvas blit involving the composited tile, at pass cadence: ~1.4 points.** Direction and area
  barely move it.
* A composited-tile *read* is priced by the unflushed work in front of it, not by its own size.
* Deferring work past the lift RELOCATES cost to the next stroke's undo snapshot unless a flush is
  forced between strokes.
* The undo system's pre-command snapshot is a free source of under-pixels.

## The unexploited implication this campaign is built on

The plane pipeline's cost is the **pass-cadence bake** that stamps the buffer into the tile — not
the plane surfaces. Removing a plane (a3) made things *worse*. And the planes already display the
final glazed pixels; that is their stated design purpose (ADR-0085's "no visible snap").

**So deferring only the bake while leaving the planes up is visually free by construction.** Every
deferral trial in campaign one (T1–T10) deferred the bake on a *direct-paint* preview instead, which
is exactly the shape the user rejected. That whole quadrant — deferral with an accurate live preview
— is unmeasured.

## Where the in-contact bakes actually come from

`recordCrayonFlush()` in `engine.ts` emits a `crayonFlush` op, and in `planes` mode each one is two
`drawImage` blits onto the composited tile plus a clear of both planes. It fires at:

* a **checkpoint** every `CRAYON_CHECKPOINT_OPS = 64` pointermoves (`engine.ts:565`),
* a **pass-tracker split** when the gesture re-covers its own laid strip (`engine.ts:592`),
* **stroke end** (`engine.ts:668`), brush change, export, and undo boundaries.

Only dirty tiles flush (`tiledRenderer.ts:286`), so dirty-tile-only flush is already shipped and is
not an available idea.

---

# The idea list

Written in full before anything was measured. Ideas are screened on the live-mixing constraint
first, then on the cost model.

## Screened OUT before measurement

* **Anything that shows unmixed wax live** — the whole `deferred` family, per-op direct paint with a
  late glaze. Disqualified by the constraint regardless of frame numbers. This is the rejection
  campaign one earned.
* **Anything that adds composited-tile blits at pass cadence or faster** — restamp variants, per-op
  tile stamping. Already measured at 1.76–5.5%; dead on arrival under the cost model.
* **Anything that only moves work offscreen without changing tile contact** — free by T4, and
  therefore pointless: it cannot move a number whose whole mass is tile contact.

## Group A — mechanism probes

Not shippable; they buy attribution the ablations could only infer. Cheapest information in the
campaign, so they run first.

**P1 — is the ~1.4 points the BLEND MODE or the BLIT?** Replace the bake's `darken` +
`source-over(1−m)` pair with (a) two plain `source-over` alpha-1 blits and (b) a single
`source-over` blit. Wrong pixels; pure cost probe. ADR-0137's N6 exonerated CSS `mix-blend-mode`,
which is a different question from canvas `globalCompositeOperation = 'darken'` — that has never
been isolated. *If blend-mode: the entire Group C offscreen-glaze family opens up and the campaign
may end there. If blit: only elimination and deferral can help, and Group C dies.*
Highest-information experiment available.

**P2 — is the cost the SOURCE canvas or the DESTINATION tile?** Bake from an `ImageBitmap`
(`createImageBitmap` of the buffer) rather than from a live canvas. Probes "the source canvas must
first be synchronized" against "the destination tile must be re-uploaded". Also a shippable shape if
it wins, and it supplies T10's forced flush for free, since the bitmap snapshot must resolve.

**P3 — destination control.** Run the exact bake call against an *offscreen* clone of the tile
instead of the tile. Wrong pixels on screen; pure cost probe. T4 established that offscreen *writes*
are free, but never with this call — this pins the model's central claim with a direct control
rather than by inference across two trial lineages.

## Group B — deferral with the planes kept up (live-accurate by construction)

**D0 — idea zero.** Keep the planes up; defer only the *closing* bake past the lift, with T10's
forced inter-stroke flush. Mid-stroke checkpoint bakes stay. Inherits `cancelPendingStamp`,
`settleClosedCrayonPass` and their tests from PR #1414. Expect a partial win — a1 says the
mid-stroke bakes cannot simply be deleted. Predicted 0.7–0.9% if the model holds.

**D1 — no in-contact bakes at all.** Checkpoints re-phase the seed and reset bounds tracking but do
**not** bake; the pass keeps accumulating on the same plane pair, and one post-lift bake + forced
flush closes the whole stroke. This is a1's shape *plus* deferral: a1 measured 1.67% with the bake
in contact, so removing ~1.4 points of it could land near 0.3%. **Carries a visual question**, and
it is not the rejected one: merging N checkpoint passes into one applies the glaze once instead of N
times, which over *existing* ink is very slightly darker (per channel the difference is m(1−m)(S−D)
per merged boundary; over blank paper it is exactly zero, which is the dominant toddler case). There
is no snap — the preview shows precisely what the bake will produce — but the steady appearance
differs from shipped, so this needs a human eye before it can ship.

**D2 — plane-pair rotation.** At a checkpoint, freeze the current plane pair (leave it composited,
content intact) and open the next pass on a second pair; bake every frozen pair post-lift. Removes
every in-contact bake like D1 **while preserving per-checkpoint mix depth exactly** — stacked
`darken`/opacity plane pairs compose to the same result as sequential bakes — so unlike D1 it has no
appearance question at all. Costs extra plane canvases, on dirty tiles only.

**D3 — persistent planes across strokes** (never measured on native; only ever in desktop Safari
against a different baseline). Don't bake at lift either: keep committed plane content composited
and bake lazily, on an idle callback or when a small pool is exhausted. Composes on top of D1/D2.

## Group C — make the bake cheap rather than rare

Live-accurate by construction (planes stay up); all three are **conditional on P1 finding the blend
mode**, and die outright if P1 finds the blit.

**C1 — offscreen glaze, one plain blit.** Compute `glaze(under, buffer)` on a detached canvas (free
per T4), then land it on the tile with a single `source-over` blit. The under pixels come free from
the history-base tiles or the undo pre-command snapshot (T9's finding).

**C2 — pattern-fill bake.** `createPattern(buffer.canvas)` + `fillRect` instead of `drawImage`.
Paper-tooth pattern strokes are free (a5); this asks whether that freedom belongs to the *primitive*
or to the *source being small*. Identical pixels by construction.

**C3 — `desynchronized: true`** on the tile and/or plane contexts. Never measured on native.
Interacts with readback, so the undo snapshot path has to be checked, not assumed.

**C4 — `will-change: transform` / `contain: paint`** on the plane layers. Never measured on native.

## Group D — sweeps (cheap, and two are owed)

**S1 — checkpoint cadence.** `CRAYON_CHECKPOINT_OPS` 64 → 128 → 256 with the tracker and splits
intact. a1 removed the tracker *and* the checkpoints together, so cadence alone has never been
measured, and it is the direct control on in-contact bake count.

**S2 — tile grid sweep.** ADR-0085's 4×4, owed as an unmet productization condition in ADR-0147.
Varying the grid changes tile aspect, plane count, bake count per stroke and bake area
simultaneously, so it is a productization input, never an attribution.

**S3 — hot-path allocation hygiene.** `getTransform()` plus four `transformPoint()` allocations per
op. Never measured on native, where per-op work is priced far more steeply than in desktop Safari.
Expected small; listed because it is nearly free to try and the model does not forbid it.

---

# Method

Per campaign-one's hard-won discipline, restated here because each line was earned by a wrong
number:

* 3+ samples per cell. Two samples hid a merged regression in campaign one.
* Check `report.meta.counts.measures > 0` before scoring anything.
* Verify every new test by reverting the fix — three of campaign one's passed against the bug.
* Assert before writing when patching source with a script; dprint rewraps anchor text.
* Confirm the patched build still paints — one trial measured a renderer that painted nothing.
* Restart the preview after any build; `cap:sync` overwrites `web/build` underneath it.
* Native captures are comparative, not gate-scored; pass `--max-attempts=1`.
* Never stop a foreign listener. Resolved ports this session: preview 4183, probe 4185, appium 4723,
  wda 8100 (4173 and 4175 are foreign).

# Results

All cells: physical iPad `00008103-0006202E3CF1001E`, iPadOS 26.5, installed Capacitor app
(`capacitor://localhost`, runtime `ios-capacitor-webview`), crayon, portrait, light,
`--gesture-repeats=10`. Every sample is fidelity-PASS with `uncalibrated: []`, cadence 116–117
moves/s, and `report.meta.counts.measures` in the thousands.

| Cell                                | lost % (in-contact) | median |
| ----------------------------------- | ------------------- | ------ |
| P1 — two plain blits, no blend mode | 1.21 / 1.44 / 1.55  | 1.44   |
| P1b — one plain blit                | 1.26 / 1.46 / 1.60  | 1.46   |

## What the probes refuted

**The blend mode is not the cost.** P1 kept the shipped bake's two blits and removed only
`globalCompositeOperation = 'darken'` and `globalAlpha = 1 − mix`. It did not improve on the
baseline; it sat marginally above it. ADR-0137's N6 exonerated CSS `mix-blend-mode`; canvas `darken`
is now exonerated too, by direct control rather than by inference.

**The blit count is not the cost either.** P1b halved the bake to a single plain blit and measured
the same. Combined with campaign one's finding that direction and area barely move it, the model
sharpens to:

> Touching the composited tile at pass cadence costs ~1.4 points **regardless of how you touch it**
> — blend mode, blit count, direction and area all fail to move it. It is priced per bake-EVENT.

That kills **C1** (offscreen glaze landed with one plain blit) outright: its only remaining
mechanism was fewer or cheaper blits, and both are now measured as free variables. It heavily
de-weights **C2** (pattern-fill bake) — the primitive itself was never swapped, so C2 is not
formally refuted, but every other property of the bake has turned out not to matter, and spending
device time on it after this is arguing from the one variable not yet found to be irrelevant.

**This leaves only Group B.** If the tile cannot be touched cheaply during contact, it must not be
touched during contact at all.

## A caveat that changes how the rest is read

All three probe cells sit at 1.44–1.46 against campaign one's 1.24 baseline, captured yesterday.
That is either a real small regression from the probes or session/thermal drift on the device.
Either way **a delta measured against yesterday's number is confounded**, so this campaign
re-captures the shipped `planes` baseline in the same session before scoring any candidate.

# Rig notes

The preflight's `--verify-ios-launch` assumes an Appium server is already listening on the resolved
port and does not start one. With no server the probe's `fetch` is refused and the check reports a
bare **`fetch failed`**, which names neither Appium nor the port. Starting
`appium --port <resolved>` first turns it into the real verdict. Worth fixing in
`prepare-capture.mjs`.
