# Gate redundancy matrix — is each quality gate load-bearing?

Every deterministic quality gate in `tools/asset-gen/` is a pure, offline scorer (image buffer(s) in
→ score/verdict out, no Gemini/network). Each has a unit suite in `tests/` that proves *broken-in →
fails, good-in → passes* with a margin. This note answers the complementary, catalog-level question:
**is each gate load-bearing, or redundant with another?** — and records the one deliberate overlap
and the classes NO gate catches (the negative space).

The matrix below is **executable**: `tests/gate-redundancy.test.mjs` runs every gate in a group over
every fixture and asserts (1) each gate is the *sole* catcher of ≥1 broken fixture, (2) no gate
fires on a good fixture, (3) the documented overlap holds. If a future change makes a gate
redundant, that test fails. Run it with `npm run test:asset-gen`.

## Fixtures are synthetic

The gates score **pixel geometry** (solid-region area, ring-nesting depth, outline registration,
background luma, colour deviation), so a hand-drawn shape exercises the same code path a shipped
regression did — while giving two things a recovered pre-fix asset can't: no dependency on an old
commit still reproducing its bug, and **one failure class per fixture**, which is what attributing a
catch in this matrix requires. Builders live in `tests/fixtures/synthetic.mjs`. The one exception is
the composite-eye blank-orb detector, which is genuinely native-resolution / real-imagery bound;
that suite keeps its recovered webp crops (`tests/fixtures/composite-eye/`).

## Group A — line-art gates

All three read a single black-on-white outline buffer. `✓` = the gate flags the fixture.

| fixture (\* = broken)    | `scoreSolidity` | `scoreEyeRings` | `scoreOutlineFrame` |
| ------------------------ | :-------------: | :-------------: | :-----------------: |
| solid pupil \*           |        ✓        |                 |                     |
| fake-hollow \*           |        ✓        |                 |                     |
| hypno-swirl eye \*       |                 |        ✓        |                     |
| four-sided frame \*      |                 |                 |          ✓          |
| ghost frame \*           |                 |                 |          ✓          |
| thin strokes (good)      |                 |                 |                     |
| normal-depth eye (good)  |                 |                 |                     |
| edge-near art (good)     |                 |                 |                     |
| three-sided frame (good) |                 |                 |                     |
| fringed edge art (good)  |                 |                 |                     |

Perfectly diagonal. `scoreSolidity` solely catches the solid-pupil (blob bar) and fake-hollow
(interior bar) classes; `scoreEyeRings` solely catches the over-deep swirl; `scoreOutlineFrame`
solely catches both page-enclosure classes: the continuous four-sided ink frame and the
page-spanning near-white ghost line an erased frame's anti-aliased fringe leaves behind (shipped by
the first monster-wide frame removal, which validated with the ink scan alone). All three are
load-bearing. The normal-depth eye, edge-near-art, and three-sided fixtures pin that the ink judge
requires continuity on all four sides instead of treating ordinary margin-adjacent lines as a frame;
the fringed-edge-art fixture pins that gray hugging a live stroke reads as that stroke's own soft
edge, not a ghost. The two bars inside `scoreSolidity` are themselves independently justified by
their two fixtures.

## Group B — night-fill gates

All read a `(source line-art, colored fill)` pair.

| fixture (\* = broken)      | `scoreNightness` | `scoreDrift` | `scoreLineColor` | `detectInventedShapes` |
| -------------------------- | :--------------: | :----------: | :--------------: | :--------------------: |
| daytime sky \*             |        ✓         |              |                  |                        |
| sub-floor white strokes \* |                  |      ✓       |                  |                        |
| thick white stroke \*      |                  |      ✓       |                  |           ✓            |
| re-inked dark lines \*     |                  |              |        ✓         |                        |
| foreign colored blob \*    |                  |              |                  |           ✓            |
| clean night fill (good)    |                  |              |                  |                        |

Every gate is still the sole catcher of at least one fixture, so none is redundant — but note the
**one overlap**: a *thick* invented white stroke is both a drift outline (`scoreDrift`) and a
floating foreign region (`detectInventedShapes`). They are not interchangeable, and the two
single-owner fixtures pin why:

* A **sub-floor white stroke** (three short strokes, each below `detectInventedShapes`'s `MIN_BLOB`
  area floor → dismissed as speckle there) is caught by `scoreDrift` alone. Drift normalizes thin
  white against the source-outline mass and has no size floor, so it sees invented strokes the blob
  detector can't.
* A **foreign colored blob** (a red flower) is caught by `detectInventedShapes` alone. `scoreDrift`
  only counts white / low-chroma pixels, so a saturated invented shape is invisible to it — this is
  the exact blind spot the invented-shape detector was built to close (IDEAS #13).

So the overlap is a coincidence of one fixture, not a redundancy: each gate owns a class the other
structurally cannot see.

## Gates covered only by their own suites

These consume a still-different input pairing, so they don't share a cross-gate group; each is
regression-locked by its own broken/good fixtures:

* `outlineMatch` (`tests/outline-match.test.mjs`) — `(source, candidate)`; the localized-drift class
  the global keep buries.
* `scoreEyeFill` / `judgeLightEyes` / `judgeNightEyes` (`tests/eye-fill.test.mjs`) —
  `(source, fill)` pair(s); flat-flooded and dead-sclera eyes.
* `scoreNightHalo` (`tests/night-halo.test.mjs`) — `(raw, line art, shipped)`; a **ranking**, not a
  pass/fail gate, so its test asserts a haloed fill ranks above a clean punch.
* `scoreCompositeEyes` (`tests/composite-eye.test.mjs`) — `(comp, light, pen)`; the blank-orb class,
  on recovered real crops.
* `scoreChalkInkDiff` (`tests/chalk-ink-diff.test.mjs`) — `(pen, chalk)`; chalk-only ink inside
  pen-bounded foreground regions plus copied ink inside solid-pen cores. Its real-fixture regression
  keeps the shipped caterpillar whitening failure and the repaired ship page as the negative
  control.

## The negative space — classes NO gate catches

The matrix proves the gates don't overlap wastefully; it does **not** claim the gates are complete.
GitHub issues labeled `area:asset-gen` are the living list of gate blind spots — the failure classes
only human composite review catches today. The load-bearing ones as of the 2026-07 migration:

* **Colored-fill invention *inside* the subject** (ISSUES #7): `detectInventedShapes` scans only the
  open background; the chalk side is covered by `scoreChalkInkDiff`, but a colored shape added by a
  fill inside a pen-bounded interior remains unseen.
* **Hero-region ↔ background contrast** (ISSUES #6): a fill can paint the subject a colour
  indistinguishable from the night sky and pass every gate.
* **Palette / motif coherence across light↔night and tall↔wide** (ISSUES #11, #12): each fill is an
  independent generation; nothing checks subject-colour plausibility.

Do not mistake "all gates green" for "image good" — these classes are why the human composite review
still ships.

## How to regenerate / extend

Add a builder to `tests/fixtures/synthetic.mjs`, wire it into the relevant suite (assert the gate
flags it with a margin), and if it belongs to Group A or B add it to
`tests/gate-redundancy.test.mjs` so the load-bearing check covers it. Keep each broken fixture
isolated to one failure class, or the matrix can no longer attribute a catch.
