# Fresh-outline regeneration — redraw the pen from scratch instead of editing it

**Decision (2026-07-13):** when a page's *pen anatomy* is the root cause of a persistent quality
issue — solid-ink pupils the light fill can't enliven, or a motif the fill model keeps misreading —
the fix of choice is a **brand-new drawing of the same subject**, generated text-to-image with no
conditioning on the old image, followed by a full-suite regen (thumb → light → chalk → night →
punch). The alternative (edit-style normalization of the existing pen,
`gen:coloring-outlines:normalize`) stays available but is now the second choice for the worst pages:
3.1's faithfulness resists erase-style edits on solid ink (ISSUES #11 caveat), while a fresh
composition simply never draws the bad anatomy in the first place.

The tool is `gen:coloring-outlines:fresh` (`gen-coloring-outlines-fresh.mjs`): a fixed baseline
**style prompt** describing the catalog's shipped look (medium-weight black pen outlines on white,
rounded chunky toddler-level shapes, closed colorable regions, outlined pupil ring + catchlight —
never solid ink, no text) plus a 1–2 sentence per-page `--scene`. The scene deliberately does
**not** describe the old composition — the point is a re-roll, not a reproduction; only the subject
must match the catalog entry. Candidates land in `.coloring-samples/fresh/` and are gated offline
before a human picks one:

| Gate        | Measure                                                  | Why                                                                                        |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| solidity    | `scoreSolidity` passes (blob ≤ 100 px, interior ≤ 60 px) | the accident-era defect the pass exists to remove                                          |
| ring depth  | `scoreEyeRings` ≤ 4                                      | no hypno-swirl eyes                                                                        |
| eye cores   | `--eyes`: `findEyeCores` ≥ 1                             | a face page whose eyes the detector can't see would make every downstream eye gate vacuous |
| border      | outer 8 px ≥ 97% white                                   | catches grey washes, border frames, edge-to-edge crops                                     |
| ink density | 1–20% dark px                                            | catches empty or dense/greyscale renders                                                   |

## The 2026-07-13 pass

Five pages were regenerated this way (soft cap 5 generations/variant, hard cap 10 — never
approached; every downstream asset passed its stock gates first-take except two noted retries):

| Page                    | Why replaced                                                                                                                                                            | Outline takes                      | Notes                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shapes/rectangle-wide` | ISSUES: night bubbles read bright white — the old pen's bubble+kidney-highlight anatomy kept being painted as googly eyeballs (hit the 10-gen hard cap in the 3.1 wave) | 5 (picked #2; #1 read as a square) | new scene has a rectangle character with a face and **no bubbles** — the failure class is gone by construction, night landed in 3 takes (one contrast `--notes` retry after an indigo-on-navy body) |
| `shapes/circle-tall`    | solid pupils, blob 2253, light-eye FAIL, historically worst chalk keep                                                                                                  | 1                                  | night first take: amber moon-like disc, high sky contrast                                                                                                                                           |
| `farm/dog-tall`         | solid pupils, blob 2309, light-eye FAIL; old chalk had whitened the collar (IDEAS #3 case)                                                                              | 1                                  | new drawing has no collar; chalk kept eyes as thin rings and the night fill painted the whites itself — composite judge passed                                                                      |
| `vehicles/police-tall`  | solid pupils, blob 1886, light-eye FAIL; the gate-blind whitened-pupil chalk case                                                                                       | 1                                  | ringed pupils remove the vacuous-pass class for this page; night contrast-note retry drifted (0.009) so the clean first take shipped (navy body separated by white chalk lines)                     |
| `objects/teddy-tall`    | solid pupils, blob 719, light-eye FAIL (IDEAS #6 named offender)                                                                                                        | 2                                  | take 1 had letters ("A"/"B") on the toy block — a `--notes` banning letters fixed it; catalog convention is no text                                                                                 |

Results: light-side flat-eye flags 39 → 35 catalog-wide, solid-pen offenders 72 → 68, all four
regenerated face pages now score lively in both themes (`farm/dog-tall` 2/2, `vehicles/police-tall`
13 cores / 7 lively, `objects/teddy-tall` 5/2, `shapes/circle-tall` 4/4 — plus
`shapes/rectangle-wide` 4/4 where the old pen had **zero** cores). Every suite passed drift, mood,
line-color, and composite eye audits; light mode byte-stability does not apply (this pass
intentionally replaces light assets).

Each fresh page also ships a `{page}.chalk.thumb.webp` (a plain resize of its chalk) as the first
batch toward IDEAS #19 / ISSUES #1 — the app does not consume them yet.

## What did NOT get a fresh drawing, and why

* `creatures/owl-tall` — the biggest solid-pen offender (blob 2908) but its chalk is the flagship
  dark-mode result; a fresh pen would re-roll it. The right fix is light-side-only (normalize or
  fresh-with-matching-eyes), made deliberately, not as part of a batch.
* The ~30 remaining flat-eye flags — a mix of detector noise on non-face cores (ISSUES #6) and
  milder solid-pupil pages. Burn down worst-first with this recipe once the five shipped pages
  survive human review.

## Caveats for the next pass

* A fresh drawing re-rolls **everything** — composition, motifs, palette anchors.
  Sibling-orientation consistency (ISSUES #14) gets worse, not better, unless the `--scene` names
  the sibling's motifs.
* The style prompt bans text; the model still tries letters on letter-bearing props (toy blocks).
  Say "no letters" in `--notes` when the scene contains any prop that conventionally carries them.
* `--eyes` only asserts ≥ 1 detectable core. For a multi-eyed subject, check the printed core count
  against the drawing yourself.
