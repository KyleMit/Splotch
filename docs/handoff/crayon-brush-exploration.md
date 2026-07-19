# Handoff — crayon brush exploration

> 2026-07-19 · branch `codex/crayon-exploration-handoff` · start a fresh crayon-brush implementation
> from `origin/main`, carrying forward the visual and architectural lessons from 33 reviewed
> experiments without continuing any of them

## Objective & non-goals

The next session should design and implement a convincing wax-crayon brush for Splotch on a **new
branch from the then-current `origin/main`**. This packet is the distilled exception to the earlier
clean-slate instruction: use the evidence and recommendations here, but do not resume, merge, or
copy one of the old crayon PR branches wholesale.

The target is a toddler-friendly crayon that:

* reads as dense wax on textured paper, with fine organic tooth and a crisp-but-broken edge;
* keeps all grain inside the swept stroke;
* visibly builds up at true same-color overdraws, including backtracking/self-crossing during one
  continuous gesture, by filling tooth while holding the selected hue;
* does not show round beads/circles at pointer-frame boundaries;
* replays exactly through undo, resize, keyframes, and PNG export;
* remains deterministic and smooth on the drawing hot path.

Non-goals:

* Do not continue any `feature/crayon-*` branch or treat a prior ADR-0065 candidate as accepted.
* Do not regenerate the committed reference images unless the user explicitly wants a changed
  target; main already contains a broad reference set.
* Do not solve buildup with multiply-style color darkening, a post-stroke settle/snap, or raster
  snapshots outside the established command-replay model.
* Do not redesign unrelated tools or the whole toolbar unless the chosen brush integration truly
  requires it.
* Do not assume the prompt's mention of redo reflects a current product feature; verify the engine
  API before adding scope.

## State

This branch exists only to carry this handoff. There is no in-flight crayon implementation to
preserve.

| Commit    | State                                                                                 |
| --------- | ------------------------------------------------------------------------------------- |
| `66c76a1` | `main`/`origin/main` baseline when this packet was written; PR #413 reference samples |

Files touched by this handoff branch:

* `docs/handoff/crayon-brush-exploration.md` only.

Current-main facts verified on 2026-07-19:

* `web/src/lib/drawing/` contains no crayon implementation.
* Main does contain the committed reference set under `artifacts/crayon-brush-samples/` and its
  generator/contact-sheet tooling under `tools/asset-gen/crayon-brush-samples/`.
* The exact heads of all 33 original implementations are preserved on remote preview branches named
  `feature/crayon-<claude|codex>-<PR number>`.
* Review classifications:
  * **Like:** #385, #386, #402, #404, #408, #410, #414, #415.
  * **Maybe:** #389, #390, #393, #394, #396, #405, #407, #412.
  * **Reject:** #353, #387, #391, #392, #395, #397, #398, #399, #400, #401, #403, #406, #409, #411,
    #416, #417.
  * **Unclassified:** #388.

The Maybe PRs were closed with focused follow-up issues: #394 → #419, #389 → #420, #390 → #421, #393
→ #422, #396 → #423, #405 → #424, #407 → #425, and #412 → #426.

## The highest-value conclusion

There are two dominant visual/deposition families and two secondary hybrids:

1. **Continuous-alpha tooth, used as the paint.** Exact crayon RGB is stored in the pattern while a
   paper-height field controls alpha. Source-over repetitions increase coverage at the same hue.
   This family contains essentially all Likes and most Maybes.
2. **Binary/opaque coverage masks.** A texel is either opaque crayon or bare paper. A different
   seed, phase, or threshold layer reveals more texels on later passes. This is naturally idempotent
   and replay-friendly, but it dominates the Rejects because it looks static/digital and does not
   thicken during a continuous scribble.
3. **Dense body plus texture/carving.** A flat body is painted first, then texture is overlaid or
   holes are cut with `destination-out`; some variants add a narrow core or wide rim. This was
   usually too solid, ghosted at edges, or felt designed rather than waxy.
4. **Explicit buildup state.** The renderer chooses a pass/layer using stroke counts, pressure,
   distance, group masks, or bounding-box overlap. These contain useful ideas, but most count the
   wrong thing: gestures or broad bounds instead of actual centerline traversals through a pixel.

The underlying noise generator is **not predictive**. Hash noise, blue noise, value noise, and
multi-octave fBm appear in both Likes and Rejects. Tile size and per-stroke phase are also not
predictive. The decisive variables are:

* the transfer function from paper height to wax alpha/coverage;
* the amount of first-pass headroom left for buildup;
* whether buildup follows real overdraw rather than Canvas op boundaries;
* whether replay preserves both the brush metadata and the number/topology of deposits.

## What worked in the Likes

Treat these as evidence about useful ingredients, not code to copy verbatim.

| PR                                                  | Approach                                                                                                                  | What worked                                                                                                                     | Required repair before reuse                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#385](https://github.com/KyleMit/Splotch/pull/385) | 64 px deterministic hash tile with several translucent alpha levels; one stored seed per gesture                          | Compact, fine, same-hue pattern; reads as tooth rather than a flat marker; separate strokes naturally build through source-over | Generic simplification replays fewer translucent deposits, so existing color fades on undo                                                                                                                    |
| [#386](https://github.com/KyleMit/Splotch/pull/386) | 32 px deterministic alpha tile shifted by a stored per-stroke phase                                                       | Phase variation gives fresh tooth without altering RGB; visually strong enough to Like                                          | Crayon fields are not copied through `commandSimplify`, so the texture disappears on undo                                                                                                                     |
| [#402](https://github.com/KyleMit/Splotch/pull/402) | Broad low-contrast coarse-plus-fine alpha pattern with a stored phase                                                     | Particularly good signal that soft, low-contrast, multi-scale tooth is preferred over hard grit                                 | Translucent round caps produce faint circles; simplification reduces deposit multiplicity and fades color on undo                                                                                             |
| [#404](https://github.com/KyleMit/Splotch/pull/404) | Fine translucent occupancy mask; pass chosen from prior same-color command bounding-box overlaps                          | Only clearly liked explicit-layer implementation; demonstrates that spatially aware buildup can improve the visual result       | Bounds are too coarse; pass can vary across live ops but is not part of style matching, so simplification flattens local pass information and replay changes texture                                          |
| [#408](https://github.com/KyleMit/Splotch/pull/408) | Large paper-anchored fBm height field mapped continuously from alpha 0.08 to 0.95                                         | One of the strongest visual foundations: organic multi-scale tooth, exact RGB, nonzero valleys, natural source-over buildup     | Slightly too light; brush metadata is dropped by simplification, completely removing texture on undo; translucent op topology still needs an exact-replay policy                                              |
| [#410](https://github.com/KyleMit/Splotch/pull/410) | Compact smoothed value-noise alpha field with a stored phase                                                              | Simple, organic, soft deposition; good proof that a huge texture module is unnecessary                                          | Metadata loss removes texture on undo; separate round-capped live ops create faint circles                                                                                                                    |
| [#414](https://github.com/KyleMit/Splotch/pull/414) | 512 px domain-warped fBm divided into dense peaks, fillable mid-valleys, and permanent zero-alpha pits; fixed paper phase | Best conceptual model of paper height; organic tooth; explicitly bypasses simplification so translucent ops replay verbatim     | Permanent pits can never fill, directly contradicting the user's request that white spots eventually color in; texture still needs tuning; verbatim per-frame round caps are not a complete geometry solution |
| [#415](https://github.com/KyleMit/Splotch/pull/415) | Two textured width bands: wide sparse rim plus narrower denser core; per-stroke phase                                     | Shows that subtle center-vs-edge density shaping can help if both bands remain toothy and contained                             | Generic simplification changes textured geometry and makes the pattern shift on undo; layered passes can easily regress into halos or an overly solid core                                                    |

Common positive pattern:

* exact selected color in RGB, with texture primarily in alpha;
* fine multi-scale tooth rather than single-pixel white noise or a chunky repeated motif;
* a continuous alpha response with visible first-pass paper and nonzero deposit in most valleys;
* deterministic, paper-coordinate anchoring;
* enough first-pass transparency that the next real traversal is visibly denser.

## What was promising in the Maybes

| PR                                                  | Useful idea                                                | Why it stopped at Maybe                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [#389](https://github.com/KyleMit/Splotch/pull/389) | Dense body followed by contained subtractive tooth         | Per-op carving and round geometry create circles; subtractive texture risks feeling stamped                               |
| [#390](https://github.com/KyleMit/Splotch/pull/390) | Direct color-seeded translucent pattern                    | Primarily blocked by circular joints, not a fatal texture-family problem                                                  |
| [#393](https://github.com/KyleMit/Splotch/pull/393) | Neighbor-smoothed low-alpha grain                          | Another visually viable soft pattern; round-cap seams remain                                                              |
| [#394](https://github.com/KyleMit/Splotch/pull/394) | Several alpha/pass levels in a tiny deterministic tile     | Pass state is global per color rather than spatial and is lost on replay                                                  |
| [#396](https://github.com/KyleMit/Splotch/pull/396) | Deposit driven by speed/pressure, with stored per-op grain | Input dynamics may be useful as a subtle secondary modulation; changing every op exposes circles and explodes style runs  |
| [#405](https://github.com/KyleMit/Splotch/pull/405) | Simple fixed two-octave continuous-alpha tooth             | Good baseline family; replay changes deposit count/topology and round caps show through                                   |
| [#407](https://github.com/KyleMit/Splotch/pull/407) | Replay-safe stored phase and verbatim op policy            | Starts too dense/solid, leaving little buildup headroom; line needs to be lighter/thinner                                 |
| [#412](https://github.com/KyleMit/Splotch/pull/412) | Large multi-scale soft-threshold pattern with stored phase | Coverage starts around 86%, so accumulation is hard to see; anti-aliased threshold values remain simplification-sensitive |

The Maybes reinforce the Likes: most are soft/graded patterns held back by stroke topology or
replay, not by the broad grain model.

## What to avoid from the Rejects

| PR                                                  | Rejected mechanism                                                                 | Specific lesson                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#353](https://github.com/KyleMit/Splotch/pull/353) | Opaque offscreen wax body, phased `destination-out` holes, black/white mottle      | Same phase for every op makes one gesture idempotent: no mid-draw thickening. Carved static holes and mottle feel patterned rather than deposited.                                    |
| [#387](https://github.com/KyleMit/Splotch/pull/387) | Low-contrast translucent tile painted by ordinary round-capped ops                 | A decent alpha field cannot hide per-frame cap beads. Fix geometry, not just noise.                                                                                                   |
| [#391](https://github.com/KyleMit/Splotch/pull/391) | Binary tooth with a global per-color deposit level                                 | A pass counter that changes only between gestures cannot respond to self-overlap during a gesture; later non-overlapping strokes can become denser merely because they are later.     |
| [#392](https://github.com/KyleMit/Splotch/pull/392) | One phased mask for a whole gesture                                                | Reusing one coverage map makes self-overlap largely idempotent and therefore visually static.                                                                                         |
| [#395](https://github.com/KyleMit/Splotch/pull/395) | Flat translucent body plus second texture layer                                    | Multiple alpha layers amplify round-cap circles; replaying fewer layers removes texture.                                                                                              |
| [#397](https://github.com/KyleMit/Splotch/pull/397) | Deposit increases with distance traveled                                           | Arc length is not overlap. A long stroke should not become denser merely because it traveled farther. The hash pattern also read as non-crayon.                                       |
| [#398](https://github.com/KyleMit/Splotch/pull/398) | Multi-octave deposit plus permanent subtractive weave                              | Complexity did not buy realism; the weave stays artificially visible and cannot fill naturally.                                                                                       |
| [#399](https://github.com/KyleMit/Splotch/pull/399) | Mostly opaque thresholded fBm with phase buckets                                   | Too-solid first pass, circular/edge ghosting, and little perceptible accumulation. Hard coverage plus soft threshold edges combines drawbacks from both models.                       |
| [#400](https://github.com/KyleMit/Splotch/pull/400) | Blue-noise alpha plus two full-size scratch/group masks                            | Correctly distinguishes current-group deposition from earlier groups, but is heavy and still visually wrong. Preserve the conceptual distinction, not the full-canvas implementation. |
| [#401](https://github.com/KyleMit/Splotch/pull/401) | Simple binary hash mask with per-stroke seed                                       | Binary speckle looks digital and cannot thicken during one gesture.                                                                                                                   |
| [#403](https://github.com/KyleMit/Splotch/pull/403) | Binary sparse edge halo plus dense body                                            | The halo/core construction looks designed and makes accumulation difficult to perceive. Avoid texture outside or wider than the intended stroke.                                      |
| [#406](https://github.com/KyleMit/Splotch/pull/406) | Near-binary multi-octave pattern with per-stroke phase                             | Replay-friendly, but the hard transfer function looks artificial and separate phases do not guarantee visible buildup.                                                                |
| [#409](https://github.com/KyleMit/Splotch/pull/409) | Flat 0.72-alpha body with the actual handmade-paper image composited `source-atop` | Overlaying paper appearance is not the same as modeling wax capture. It stays too solid and magnifies cap/replay artifacts.                                                           |
| [#411](https://github.com/KyleMit/Splotch/pull/411) | 80% binary fBm mask with per-stroke phase                                          | High opaque coverage looks static and marker-like; phase union does not read as gradual wax.                                                                                          |
| [#416](https://github.com/KyleMit/Splotch/pull/416) | Nested opaque masks at 70/83/93/100%, selected by bounding-box overlap layers      | Deterministic but stepped. Bounding-box overlap is not pixel/path overlap, and layer jumps feel synthetic.                                                                            |
| [#417](https://github.com/KyleMit/Splotch/pull/417) | Continuous fBm with a nonzero floor, high 0.93 deposit, and random phase           | Correct family can still fail if the first pass is nearly saturated. High initial density leaves buildup visually invisible; the tuned field itself still read as non-crayon.         |

Avoid these recurring patterns even if reimplemented with a different noise function:

* pure binary masks or permanent alpha-zero holes;
* global per-color pass counters;
* bounding-box overlap as the final accumulation signal;
* opacity/density tied mainly to elapsed distance;
* a flat body followed by paper-image overlay;
* multiply, RGB darkening, black/white mottle, or post-stroke settle;
* wider halos, loose speckles, or dots outside the swept shape;
* a new round-capped `stroke()` for every pointer frame;
* render-time `Math.random()` or unstored mutable texture state;
* allowing generic command simplification to silently discard or merge non-idempotent brush data.

## Decisions made (and why)

These are recommendations for the next experiment, not an accepted ADR. Validate them visually and
technically before documenting a final decision.

### 1. Start from a continuous paper-height-to-alpha model

Build one deterministic, seamless, paper-coordinate height field with fine multi-scale features and
subtle low-frequency density variation. The strongest ingredients came from #408 and #414:

* 256–512 paper-pixel repeat period so the motif is not obvious;
* roughly 3–4 value-noise/fBm octaves concentrated in the fine-to-medium tooth range;
* optional subtle domain warp to remove lattice regularity;
* exact crayon color in RGB, with the height field mapped to alpha only.

Use a continuous response, conceptually:

```text
depositAlpha = valley + (peak - valley) * pow(toothHeight, gamma)
```

A reasonable **starting search range**, not a verified answer, is valley 0.05–0.15, peak 0.90–0.97,
and a gamma that leaves a visibly broken but dense first pass. Do not use permanent zero-alpha pits:
the user's #414 feedback explicitly requires white spots to color in after enough scribbling.

Repeated same-RGB source-over holds hue while coverage follows:

```text
accumulatedAlpha(n) = 1 - (1 - depositAlpha)^n
```

The formula is desirable only when `n` represents a real path traversal. In the current engine it
instead counts overlapping Canvas op caps, which is the central defect to solve.

### 2. Treat grain and stroke topology as separate problems

The recurring circles are not primarily a texture-generation problem. The engine currently:

* sets `lineCap = 'round'` globally;
* draws a separate round start dot;
* records and renders a new path op for each pointer-frame batch;
* calls Canvas `stroke()` independently for those ops.

With translucent wax, each op boundary becomes another physical deposit. Adjacent frame caps overlap
and become periodic darker circles; the start dot can double-deposit under the first path.

The recommended fresh experiment is a **continuous swept-strip renderer** for crayon geometry:

* flatten or sample the centerline deterministically;
* tessellate consecutive samples into a strip/quad mesh with shared joins rather than overlapping
  round-ended strokes;
* adjacent segments should share an edge and deposit once;
* non-adjacent geometry that genuinely crosses/backtracks should source-over again and become
  denser;
* emit one real start cap and one real final cap only;
* if a round live fingertip is needed before pointer-up, render a provisional terminal cap on a
  replaceable active-stroke overlay instead of permanently stamping a new cap every frame;
* a tap remains one tip disk.

This is the missing distinction none of the reviewed PRs fully achieved: **adjacent implementation
segments are one physical pass; a later traversal through the same paper is another physical pass.**

If a strip is too ambitious for the first prototype, test a smaller crayon-only geometry seam using
butt-ended internal segments and an explicit, non-overlapping join construction. Do not merely
switch to `lineCap = 'butt'` without addressing corner wedges and endpoint behavior.

### 3. Use fixed paper anchoring before adding per-stroke phase

The review does not show a decisive preference for phase-shifted versus fixed texture: both appear
among Likes and Rejects. Begin with a fixed paper-coordinate field because it is physically
coherent, easy to replay, and cannot visibly move on undo. A nonzero valley already allows buildup
without changing phase.

Only add a stored per-stroke phase if controlled comparisons prove that fixed tooth fills too
slowly. If added, phase must be derived at stroke capture, stored in the command, constant through
the gesture, and included in style matching/copying. Never derive it from render order or time.

### 4. Give crayon an explicit replay contract

Splotch's invariant is one renderer for live drawing and every rebuild. See ADR-0033 and
`strokeOps.renderOp`. A translucent brush is non-idempotent, so generic geometric simplification is
not automatically legal.

Initial safe policy:

* store the crayon brush kind plus every field needed to reproduce deposit;
* include those fields in `pathStyleMatches` and every reduced/copied op constructor;
* preferably store the canonical centerline/strip primitives actually rendered;
* bypass generic simplification for crayon until a brush-aware simplifier proves 0-pixel drift;
* rely on the existing ADR-0035 keyframe path to bound very long scribbles, as #414/#417 did;
* test live pixels against replay, resize, export, and any keyframe/fold path—not only that undo
  “looks similar.”

The two observed undo failure classes must both be guarded:

1. **Metadata loss:** #386, #394, #408, and #410 dropped brush/seed/pass fields and replayed as flat
   strokes.
2. **Deposit-topology loss:** #385, #402, #404, #405, and #415 preserved some fields but merged many
   translucent live deposits into fewer replay paths, producing fade or texture shift.

### 5. Keep the hot path cheap and warm expensive texture work

Generate the height/alpha field once, cache tinted tiles per color, and cache patterns per target
context. Warm the shared field and active color tile during idle or immediately after color/brush
selection. Do not allocate a full-canvas scratch surface per op. If an active-stroke overlay/mask is
needed, keep it bounded to the stroke or reusable/grow-only and profile its clearing/blitting cost.

The user's original target was average per-op draw around or below 2 ms under 4× CPU throttle, with
no individual draw frame above roughly 8 ms. Reconfirm the current harness and baseline before
treating those numbers as a hard repo guarantee.

## Recommended validation matrix

Do not rely on a single straight-line screenshot. Render and inspect at least:

| Scene                                     | What it proves                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Tap followed by a short line              | Start dot/cap does not double-deposit or leave a circular bulb                    |
| Slow and fast straight lines              | Density is independent of pointer event frequency                                 |
| Smooth curve and zigzag                   | Internal joins stay continuous without beads, gaps, or halos                      |
| One gesture backtracking over itself      | True mid-gesture overdraw gets denser while adjacent frame seams do not           |
| One gesture self-crossing/loops           | Non-adjacent path crossings accumulate naturally                                  |
| Second separate same-color stroke         | Tooth fills gradually, hue stays fixed, no post-lift snap                         |
| Different-color crossing                  | Colors remain contained and layering is plausible; no unexpected multiply mud     |
| Dense scribble fill                       | White tooth gradually fills; no permanent artificial hole motif or visible tiling |
| Undo after a later command                | Remaining crayon pixels are exactly unchanged                                     |
| Resize/orientation and export             | Rebuild/export use the identical grain coordinates and geometry                   |
| Long scribble crossing keyframe threshold | Replay remains bounded without changing pixels                                    |

Automatable checks worth adding:

* pixel diff of live crayon versus replay: exactly 0 changed pixels where the existing invariant
  requires it;
* containment: no nontransparent crayon pixels outside a reference swept-stroke mask, allowing only
  the normal antialias tolerance at the boundary;
* same-color hue stability: overlap RGB stays at the selected color within canvas antialiasing
  tolerance while alpha/coverage increases;
* buildup: a predefined overlap region gains coverage during both a continuous backtrack and a
  separate second stroke;
* event-rate invariance: the same geometric path sampled densely versus sparsely produces identical
  or explicitly bounded-equivalent output;
* seam check: no periodic density spikes at historical op endpoints;
* performance marks around draw, undo, resize, keyframe, and initial texture warm.

Use the vision judge only as a regression/critique signal. Previous attempts showed that an
automated judge can be useful for containment and obvious pattern regressions but unreliable about
absolute wax realism and subtle buildup. Final selection must be direct visual comparison against
the committed references.

## Unverified assumptions

The next session must test these before depending on them:

* A swept-strip/mesh renderer is the strongest proposed solution to “real crossing accumulates, op
  seam does not,” but no reviewed PR implemented and validated that exact design.
* The suggested 0.05–0.15 valley and 0.90–0.97 peak ranges are informed starting points, not
  measured winners.
* Fixed paper phase is recommended for stability, but the review does not prove the user prefers it
  over a subtle stored phase; visual A/B remains necessary.
* The original ≤2 ms average / ≤8 ms maximum performance thresholds were user-provided targets. No
  performance run was executed during this analysis session.
* The existing keyframe threshold may or may not be sufficient if raw crayon geometry is retained;
  run `perf:undo` and inspect raster memory as well as latency.
* Current source appears to expose undo but not redo; verify before interpreting “redo” as an
  implementation requirement.
* The old PR branches and their Netlify previews existed during the review, but their remote
  lifetime is not guaranteed. The distilled findings in this packet should be sufficient without
  them.

## Done & verified

This session was analysis and handoff creation only; no crayon implementation was made.

Verified:

* Inspected the exact remote head and drawing-engine changes for all 33 original PRs.
* Classified each implementation by texture field, alpha/coverage transfer, buildup mechanism,
  stored command metadata, simplification behavior, and the user's Like/Maybe/Reject observation.
* Correlated the code mechanisms with the user's visual review notes.
* Confirmed the two separate undo failure classes described above.
* Read the relevant architecture/ADR guidance: imperative engine, command replay, keyframes,
  commit-time simplification, and the existing pattern-based magic-brush precedent.
* Confirmed `origin/main` at `66c76a1` has no crayon code but does have the merged reference
  samples.
* Confirmed the browser floor is Chrome 111+ and Safari/iOS 16.4+.

Not run because no implementation changed:

* `npm run check`
* `npm test`
* `npm run perf:web`
* `npm run perf:undo`
* visual app/browser verification

## Risks & next 3 steps

1. **Consume this packet, then start clean.** Fetch origin, update local main, create a new
   implementation branch directly from `origin/main`, and do not merge the handoff branch. Read the
   current skills/ADRs/source and inspect the committed crayon reference sheet before designing.
2. **Prototype the two hard parts independently.** First build a tiny deterministic continuous-alpha
   tooth and render controlled static shapes. Separately prove a crayon-specific continuous geometry
   path where adjacent samples do not double-deposit but true backtracking does. Combine them only
   after both behaviors are measurable.
3. **Integrate through ordinary stored ops and close the loop.** Add A/B controls and targeted
   tests, verify 0-pixel replay/resize/export behavior, run the reference-scene visual loop, then
   profile web draw and undo/keyframe behavior before declaring a winner.

## Reread first

Skills, in this order:

* `.agents/skills/architecture/SKILL.md`
* `.agents/skills/adrs/SKILL.md`
* `.agents/skills/testing/SKILL.md`
* `.agents/skills/profiling/SKILL.md`
* `.agents/skills/run-splotch/SKILL.md` when visually exercising the real app
* `.agents/skills/pr-screenshots/SKILL.md` before opening a UI-visible PR

Load-bearing source on current main:

* `web/src/lib/drawing/strokeOps.ts:19` — op vocabulary; `:67` shape painting; `:107` the single
  live/replay renderer.
* `web/src/lib/drawing/engine.ts:336` — round cap/join setup; `:410` start dot; `:440` independently
  rendered pointer-frame path ops.
* `web/src/lib/drawing/commandSimplify.ts:117` — style matching; `:166` run reduction; `:192`
  command simplification.
* `web/src/lib/drawing/undoHistory.ts:173` — keyframing; `:218` baseline fold; `:283` replay.
* `docs/COMPATIBILITY.md` — Chrome 111 / Safari and iOS 16.4 floor and API risk register.

Architecture records:

* `docs/adrs/0004-imperative-canvas-engine.md`
* `docs/adrs/0033-command-replay-undo.md`
* `docs/adrs/0035-keyframe-long-commands.md`
* `docs/adrs/0036-stroke-simplification-at-commit.md`
* `docs/adrs/0043-magic-brush-color-sheet-reveal.md` — precedent for a patterned ordinary op.

Visual target and tooling already on main:

* `artifacts/crayon-brush-samples/index.html` — committed contact sheet; published at
  <https://kylemit.github.io/Splotch/crayon-brush-samples/>.
* `tools/asset-gen/crayon-brush-samples/README.md` — stages and regeneration workflow.
* `tools/asset-gen/crayon-brush-samples/samples.mjs` — exact prompts/specs for single strokes,
  buildup, crossings, scribbles, and fills.

## Suggested fresh-session prompt

The following adapts the original prompt with the strongest evidence from the review. It
deliberately defines outcomes and known traps while leaving the next agent room to produce its own
implementation.

```markdown
# Task: build a convincing Splotch crayon brush from the strongest experimental evidence

Resume `docs/handoff/crayon-brush-exploration.md`, absorb it, and let the resume-handoff workflow
delete the packet. Then fetch origin and create a **fresh implementation branch directly from the
current `origin/main`**. Do not continue or merge any old `feature/crayon-*` implementation branch.
The handoff is the distilled evidence; design the new implementation yourself.

Orient with the repo's `architecture`, `adrs`, `testing`, and `profiling` skills, then read the
drawing engine, command replay, simplifier, keyframe path, compatibility floor, and the committed
crayon reference contact sheet.

## Product goal

Splotch is a drawing app for toddlers. Add a crayon brush that convincingly behaves like wax crayon
on textured paper—not a marker, a noisy pen, an airbrush, or a paper image overlaid on a flat
stroke.

### Look

1. A single pass has a dense wax body broken by fine, organic paper tooth.
2. Grain stays inside the exact swept stroke. No spray, starburst, halo, or loose speckles.
3. The edge is crisp but irregular/broken—not blurry, and not harsh digital grit.
4. Keep the selected RGB/hue. Texture should primarily modulate deposited coverage/alpha.

### Buildup—the most important behavior

5. A genuine second traversal over the same paper gets denser by filling tooth while staying the
   same hue. This includes both a new same-color stroke and backtracking/self-crossing during one
   continuous gesture.
6. Buildup occurs live under the moving finger, never as a pointer-up snap.
7. Adjacent pointer-frame segments are not extra physical passes. There must be no periodic dark
   circles at frame/op boundaries or a darker start-dot bulb.
8. White tooth may survive early passes, but enough scribbling should eventually color it in. Avoid
   permanent alpha-zero pits.

### Integration and correctness

9. Preserve Splotch's single-renderer command-replay invariant: undo, resize, keyframes/folds, and
   PNG export must reproduce the exact live pixels. Keep the existing 0-pixel-drift tests green and
   add a crayon-specific replay test.
10. Rendering is deterministic. No render-time randomness or hidden live-only state; store every
    variation parameter needed for replay.
11. Do not pass a translucent/non-idempotent brush through generic simplification unless live and
    replay use the same canonical geometry. A safe first implementation may bypass simplification
    for crayon and rely on ADR-0035 keyframes, then profile the tradeoff.
12. Respect Chrome 111 and Safari/iOS 16.4. Feature-detect any API outside that floor.

### Strong implementation prior—not a mandate

Start by testing a deterministic, paper-anchored, multi-scale height field mapped continuously to
alpha with exact crayon RGB. Prefer a small nonzero valley deposit and a near-opaque peak over a
hard binary threshold. Keep enough first-pass headroom for buildup.

Treat stroke topology separately from grain. Investigate a crayon-specific swept strip/mesh or an
equivalent construction where consecutive samples share geometry and deposit once, while a real
non-adjacent crossing deposits again. A new round-capped Canvas `stroke()` per pointer frame is a
known failure mode and should not be the final design.

Start with a fixed paper phase. Add a stored per-stroke phase only if a controlled A/B demonstrates
a clear improvement without replay movement.

Avoid binary masks, permanent holes, global pass counters, bounding-box-only buildup, multiply,
black/white mottle, actual-paper overlays, wide halos, post-stroke settle, and full-canvas per-op
scratch work.

### Iteration and evidence

Use `artifacts/crayon-brush-samples/index.html` as the north star. Build a repeatable renderer for:

* tap, straight line, curve, and zigzag;
* slow versus fast sampling of the same path;
* one-gesture backtrack and loop/self-crossing;
* separate same-color overdraw;
* different-color crossing;
* dense scribble fill;
* undo/replay, resize, export, and a keyframed long scribble.

Add quantitative checks for containment, same-hue buildup, event-rate invariance, seam/circle
absence, and exact replay. A vision model may critique the rendered contact sheet, but use it as a
regression signal—not an oracle. Make the final call by direct visual comparison with the committed
references.

### Performance and delivery

Keep texture generation off the pointer hot path through deterministic caches and idle warming. Use
the current profiling skill/harness to measure draw, undo, resize, and keyframe cost under 4×
throttle; target roughly ≤2 ms average draw op and no draw-frame spike around 8 ms, after confirming
the current baseline.

Make the brush selectable and dev-A/B-able using the existing engine patterns. Deliver:

* the implementation on the fresh branch;
* focused unit/E2E pixel tests, including buildup and exact replay;
* performance results;
* side-by-side renders against the committed references, including single/double pass and a
  continuous self-overlap scene;
* a short explanation of the chosen geometry, grain transfer, replay policy, and rejected variants.

Do not stop at the first plausible texture. Iterate until the single stroke, true overdraw, undo,
and performance criteria all hold together.
```
