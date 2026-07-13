# Idea #12 — Eye detector: side profiles and non-face cores

**Verdict: WORKED.** Two small, principled suppressions in `judgeNightEyes` clear **all five**
night-side false-flags in the catalog (duck-wide, monster-wide ×7, rover-wide, fire-tall,
train-wide) while retaining every true fail (caterpillar-wide ×2, ladybug-wide ×2, snail-wide) and
leaving the light column byte-identical (teddy/police/etc. still FAIL). Fully offline, 0 Gemini
calls. Patch: `code/fix-eye-judge.patch`.

## 1. Reproducing the noise (baseline, full catalog)

`node tools/asset-gen/audit-fill-eyes.mjs` at 8e471b8: 94 pages audited, 58 flagged. Night-side
FAILs:

| page                    | baseline night | adjudication                                                      |
| ----------------------- | -------------- | ----------------------------------------------------------------- |
| farm/duck-wide          | FAIL (1 flat)  | **false flag** — side-profile eye, visually lively                |
| space/rover-wide        | FAIL (1 flat)  | **false flag** — rover part, not a face                           |
| vehicles/fire-tall      | FAIL (1 flat)  | **false flag** — truck part                                       |
| vehicles/monster-wide   | FAIL (7 flat)  | **false flag** — wheel hubs / tread / suspension                  |
| vehicles/train-wide     | FAIL (1 flat)  | **false flag** — train part (composite disproved per pipeline.md) |
| nature/caterpillar-wide | FAIL (2 flat)  | **true fail** — spiral pupil never painted dark (ships with ⚠)    |
| nature/ladybug-wide     | FAIL (2 flat)  | **true fail** — same spiral-pupil refusal                         |
| nature/snail-wide       | FAIL (1 flat)  | borderline — pipeline.md says human-judged fine, see Limitations  |

(The 50 light-side FAILs are a separate phenomenon — accident-era pens with solid pupils produce 0
lively cores — out of scope for this idea; none of them changed.)

## 2. Why the hubs still fire despite the existing lit-reference suppression

Instrumented every core (`code/idea12-instrument.mjs`). The existing suppression is
`STRONG_LIGHT_SIDE = 180`: a core gates only if the **light** fill paints it lively with a genuinely
light side. Monster-wide's firing cores (7,8,10-14) measure light core ~194-212 on band-dark ~88
with bandLight ~196-214 — **wheel hubs are legitimately light-on-dark by day** (pale hub on dark
tire), so they sail past the 180 bar as "strong reference eyes". At night the fill paints the wheels
dark (core 25-147) → "flat" → FAIL. The suppression was never wrong- threshold; it's the wrong
signal — day-lit contrast can't distinguish a hub from an eye.

The signal that CAN: **the chalk**. Post pen/chalk fork the chalk owns the eye whites, and the night
gate already judges the simulated composite (`compositeNight`), where every chalk white renders
~255. Measured on the composite:

* every real eye structure has chalk-white at the core or in its band (duck 254, caterpillar
  251/255, ladybug 255/255, snail 254);
* every non-face firing core has none — `max(coreLuma, bandLight)` = 52/72, 53/62, 26/52, 143/42,
  76/54, 25/48, 147/41 (monster), 25/35 (rover), 16/54 (fire), 29/43 (train).

The committed, human-reviewed chalk **is** the per-page eye annotation idea (a) asks for.

## 3. Why duck-wide fires (the actual root cause — not side-profile-ness)

`code/idea12-crop.mjs` strips (pen | chalk | light | night,
`img/farm_duck-wide.pen-chalk-light-night.webp`) show the night eye is perfectly lively: chalk-white
sclera, navy pupil, white catchlight. But the measured band is `bandDark=179, bandLight=254` — no
dark side. Cause: duck's **accident-era pen pupil is SOLID ink**, and `scoreEyeFill`'s band excludes
pen-ink pixels — so the annulus around the catchlight is 74% pen ink (`code/idea12-inkfrac.mjs`) and
the detector literally cannot see the dark pupil; it samples only the chalk-white sclera beyond it.
The core is **band-blind**. The light fill passed the same geometry only by luck (its own re-inked
pupil fringe leaks dark pixels just outside the pen ink, bandDark=63).

Calibration: duck-wide 0.74, duck-tall 0.77 (its small core) vs every thin-stroke true-fail core at
0.26-0.29; highest non-blind gating core anywhere ~0.36. A 0.5 bar separates cleanly.

## 4. The fixes (all in `lib/eye-fill.mjs` + a `chalked` flag through the two callers)

1. `scoreEyeFill` now reports `annulusInkFrac` per core (share of the geometric annulus that is
   source ink). The band sampling itself is untouched — the four-failed-band-definitions warning in
   pipeline.md is respected; this only *measures* how blind the band is.
2. `judgeNightEyes(scoredNight, scoredLight, { chalked })` skips a would-fail reference core when:
   * `lightCore.annulusInkFrac > BAND_BLIND_INK_FRAC (0.5)` — the pen's solid ink hides the
     structure; the band stats are meaningless (fixes duck-wide); or
   * `chalked && max(nightCore.coreLuma, nightCore.bandLight) < CHALK_WHITE_MIN (245)` — no
     chalk-white anywhere near the core at night => the chalk never marked it as an eye => non-face
     core (fixes monster hubs, rover, fire, train).
3. `audit-fill-eyes.mjs` and `gen-coloring-fills-dark.mjs` pass `{ chalked: !!chalk }` — the
   chalk-annotation suppression never applies to un-forked pages, where a dark core could be a
   genuinely flooded catchlight (the bee-wide-era failure).

Safety analysis of the chalk-white rule: a real regression can't hide behind it. A flooded
catchlight is chalk-forced white (core >= 245 → still gates); a washed-out pupil sits on a
chalk-white sclera (bandLight >= 245 → still gates). The only structures with no chalk-white nearby
are ones the chalk author deliberately left un-whitened — i.e. not eyes. The dead-sclera ladybug
regression that created per-structure enforcement was pre-fork; post-fork the sclera is chalk-owned
and cannot be dead.

## 5. Before / after (full catalog, `audit-fill-eyes.mjs`)

| page                                         | before              | after                                         |
| -------------------------------------------- | ------------------- | --------------------------------------------- |
| farm/duck-wide                               | night FAIL (1 flat) | **ok** — cleared                              |
| space/rover-wide                             | night FAIL (1 flat) | **ok** — cleared                              |
| vehicles/fire-tall                           | night FAIL (1 flat) | **ok** — cleared                              |
| vehicles/monster-wide                        | night FAIL (7 flat) | **ok** — cleared                              |
| vehicles/train-wide                          | night FAIL (1 flat) | **ok** — cleared                              |
| nature/caterpillar-wide                      | night FAIL (2 flat) | night FAIL (2 flat) — retained                |
| nature/ladybug-wide                          | night FAIL (2 flat) | night FAIL (2 flat) — retained                |
| nature/snail-wide                            | night FAIL (1 flat) | night FAIL (1 flat) — retained (conservative) |
| all 50 light-side FAILs (teddy, police, ...) | FAIL                | FAIL — column byte-identical                  |
| totals                                       | 58 flagged          | 53 flagged                                    |

Raw outputs: `baseline-audit.txt`, `fixed-audit.txt`.

## 6. Idea (b) — side-profile >=-count relaxation: assessed and REJECTED

Duck-wide's problem is not that it has one eye; it's that the band is ink-blind. A single-eye
relaxation of the per-structure count would have (i) not fixed monster/rover/fire/train (multi- core
pages), and (ii) weakened true-fail retention on any genuine one-eyed page. The band-blind measure
fixes the actual mechanism and generalizes (duck-tall's small core is equally blind at 0.77 — it
just happens to pass today by fringe luck).

## 7. Idea (a) — committed annotation: sketched, and largely obsoleted

`code/eye-annotations.draft.json` (94 pages, 300 cores, 45 draft eyes) is the generated draft: per
page, each pen-detected core with `x, y`, a draft `eye` guess, and the machine reasons
(`lightReference`, `bandBlind`, `chalkWhiteNear`), plus a `blessed: false` flag for one-time human
review. Generator: `code/idea12-annotations.mjs`.

But the experiment shows the catalog **already contains a blessed annotation: the chalk**.
"Chalk-white near the core at night" is exactly "a human marked this core as an eye when authoring
the chalk", and it's maintained automatically as pages are re-chalked. The standalone JSON is only
worth committing if (a) un-forked pages ever need non-vacuous night gating, or (b) someone wants to
gate cores the chalk *doesn't* whiten. Recommend NOT committing it — adopt the chalk-as-annotation
rule instead. Caveat if it is ever adopted: the draft `eye` field means "gateable eye", not "is an
eye" — duck-wide's real eye is drafted `false` because it's band-blind (un-gateable), which a human
blesser should understand.

## Limitations

* **snail-wide still fires** (1 flat) and pipeline.md says its flag was human-judged fine. Its
  measurements (night core 254, band 136-255, inkFrac 0.20) are statistically indistinguishable from
  caterpillar-wide's TRUE fail (251, 255-255, 0.26-0.29) with the current band — clearing it would
  require a new signal (or the committed annotation). Left firing = conservative.
* `CHALK_WHITE_MIN = 245` assumes `compositeNight`'s screen renders chalk ink ~255; if the composite
  ever gains antialiasing/blur, recalibrate (observed real-eye values were 251-255).
* `BAND_BLIND_INK_FRAC = 0.5` calibrated on 14 pages' cores (gap: 0.36 vs 0.54); a future page with
  a half-inked annulus around a real, genuinely-dead eye would be skipped. Band-blind cores were
  never *reliably* gateable anyway.
* The dark generator's per-take gate uses the same judge, so generation stops burning retries on
  hub-flat takes — but this experiment only validated the audit path end-to-end (the generator path
  is the same function + flag, verified by reading, not by paid generation).
* Bycatch observed, not fixed: monster-wide's actual FACE eyes (windshield) never gate at all — they
  read flat in the light fill (white-on-white sclera band), so they were never references. The
  light-reference scheme has a blind spot for eyes on white faces; noteworthy for a future idea.

## Files

* `code/fix-eye-judge.patch` — the fix (3 files: `lib/eye-fill.mjs`, `audit-fill-eyes.mjs`,
  `gen-coloring-fills-dark.mjs`); apply with `git apply` at repo root.
* `code/idea12-instrument.mjs`, `code/idea12-inkfrac.mjs`, `code/idea12-crop.mjs`,
  `code/idea12-evidence.mjs`, `code/idea12-annotations.mjs` — standalone scripts (place inside
  `tools/asset-gen/`, run from repo root).
* `code/eye-annotations.draft.json` — idea (a) draft annotation, whole catalog.
* `img/*.night-{before,after}.webp` — night composites with firing cores circled red (before) and
  cleared cores circled green (after); caterpillar/ladybug stay red in "after" as designed.
* `img/farm_duck-wide.pen-chalk-light-night.webp` — the duck eye across pen / chalk / light raw /
  night composite, showing the solid pen pupil that blinds the band.
* `baseline-audit.txt`, `fixed-audit.txt`, `instr/` — raw evidence.
