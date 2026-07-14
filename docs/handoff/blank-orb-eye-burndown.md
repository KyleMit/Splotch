# Handoff — composite blank-orb night-eye burndown

> 2026-07-14 · branch `claude/asset-gen-tier-1-fixes-m51by9` · PR
> [#142](https://github.com/KyleMit/Splotch/pull/142) · burn down the ~17 shipped pages the new
> composite-eye gate flags as blank-orb night eyes

## Objective & non-goals

**Objective.** The 2026-07-14 composite-eye gate (`lib/composite-eye.mjs`) flags shipped pages whose
night eye composites to a blank white orb. Fix the real ones with the proven chalk-geometry +
no-fill-catchlight recipe (below), gated by `scoreCompositeEyes`.

**Required flow (do NOT skip step 1):**

1. **Review first, fix nothing.** Build the visual review artifact of *all* flagged eyes and publish
   it, then **stop and let the user mark which pages are real defects vs. over-flags.** The gate can
   over-flag an eye whose catchlight is large relative to a small pupil, so some (esp. shape/moon
   faces) may look like legible dark pupils despite a high median — those are borderline, not
   broken.
2. **Only after the user approves the listing**, burn down the approved subset one page at a time.

**Non-goals.** Don't touch the piece-wise eye gate (`judgeNightEyes`) or the detector's thresholds —
they're calibrated and shipped. Don't fix `nature/{horse,bee,caterpillar}` / `objects/teddy` here —
those are the separate ringed-chalk class already tracked in ISSUES Tier 1 #1. Don't touch
light-mode bytes (night-only invariant, enforced by `check:assets:manifest`).

## State

Branch is pushed. PR #142 is open (draft). Commits that landed this arc:

| sha       | what                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `e05696e` | Real fix for stego+velo night eyes — chalk erase-and-redraw (the two were NOT fixed by PR #142's night-only regen) |
| `8d3a51f` | Composite-eye gate + re-fix stego's half-white eye; `orb` column in the eyes audit                                 |
| (pending) | This handoff + `review-orb-eyes.mjs` tool (commit before ending)                                                   |

Key files (reread these first):

* `tools/asset-gen/lib/composite-eye.mjs` — `scoreCompositeEyes(comp, light, pen)`. Locates the
  band-blind solid-pen eyes `judgeNightEyes` skips (bright catchlight core, `annulusInkFrac > 0.5`),
  finds the pupil the **light fill** paints dark, and measures it on the composite (eroded to shrug
  off light↔night registration jitter). Blank orb ⇔ `median ≥ 150 || whiteFrac ≥ 0.5`.
* `tools/asset-gen/bin/review-orb-eyes.mjs` — the review-artifact generator (see step 1).
* `tools/asset-gen/bin/gen-coloring-fills-dark.mjs:300` — the night generator now folds the orb
  check into its eye gate (`generateCleanTake`), so a regen self-rejects blank-orb takes.
* `tools/asset-gen/bin/audit-fill-eyes.mjs` — the `orb` column.
* `tools/asset-gen/fill-src/dinosaur/notes.json` — **the proven recipe**, stego entry (`chalk.retry`
  * `night.retry`). Copy its structure per page.

## The flagged list (17, re-derive to be current)

Authoritative source — do not trust this snapshot, re-run it:

```
npm run gen:coloring-fills:audit:eyes 2>&1 | grep BLANK-ORB
```

Snapshot 2026-07-14 (median in parens; higher = whiter = worse): `creatures/dragon-tall` (254),
`creatures/dragon-wide` (255), `creatures/mermaid-tall` (214), `creatures/owl-tall` (255,
**confirmed real** — white pupil, tiny catchlight ring), `creatures/owl-wide` (255),
`creatures/unicorn-tall` (254), `creatures/unicorn-wide` (255), `dinosaur/triceratops-tall` (255),
`dinosaur/velociraptor-tall` (255), `farm/cat-tall` (255), `farm/cow-tall` (254), `space/moon-tall`
(254), and the shape faces `shapes/square-tall`, `shapes/square-wide`, `shapes/star-tall`,
`shapes/triangle-tall`, `shapes/triangle-wide` (all 255).

## Step 1 — build & publish the review artifact (turnkey, tested this session)

```
npm run gen:coloring-fills:audit:eyes:review -- --out /tmp/orb-review.html
```

Then publish `/tmp/orb-review.html` with the **Artifact** tool (it's self-contained, ~3.6 MB — no
`--out` writes to repo root; use `/tmp`). Each card = whole-page composite + zoomed flagged eye(s)
with median/white. Ask the user to reply with the pages to fix. **Wait for that before step 2.**

## Step 2 — burn down each approved page (the proven recipe)

Both a chalk regen AND a night regen are needed; light bytes must not move. Per page:

1. **Chalk** — re-roll with the geometry note (`GEMINI_API_KEY` is in the env):
   ```
   node --experimental-strip-types --disable-warning=ExperimentalWarning \
     tools/asset-gen/bin/gen-coloring-chalk.mjs <cat>/<page> \
     --notes "<geometry note: large centred BLACK pupil filling most of the eyeball, only a THIN even white sclera rim, ONE small white catchlight; no white lobe/crescent>" \
     -t 0.45 --max-attempts 10 --apply --force
   ```
   Verify the negated chalk eye shows a big dark pupil in a thin white ring before spending night
   budget. (Exact wording that worked for stego is in `fill-src/dinosaur/notes.json` → stego
   `chalk.retry.notes`.)
2. **Night** — regen against the new chalk; the composite-eye gate is now live in the generator so
   it self-rejects fill-catchlight takes:
   ```
   node ... tools/asset-gen/bin/gen-coloring-fills-dark.mjs <cat>/<page> \
     --notes "paint the pupil interior UNIFORMLY deep near-black — do NOT paint any white/light/grey/blue catchlight, glare, or reflection inside the eye; the line art already provides the only white. <plus identity color pins for the subject>" \
     --samples 4 --max-attempts 6
   ```
   Pick the sample with the darkest composite pupil (`scoreCompositeEyes` median < ~60 is the
   target; stego shipped at 19). Copy it into `fill-src/<cat>/<page>.night.raw.webp`.
3. **Derive + freeze** (deterministic, no key):
   ```
   npm run gen:coloring-punch -- <cat>/<page>
   npm run gen:coloring-thumbs -- <cat>            # refreshes the chalk thumb
   npm run gen:coloring-golden:diff                # expect only this page moved
   npm run gen:coloring-golden:freeze && npm run gen:assets:manifest
   npm run check:assets:manifest                   # light bytes must be untouched
   node tools/asset-gen/bin/audit-fill-eyes.mjs <cat>/<page>   # orb → ok
   ```
4. Record the winning notes in `fill-src/<cat>/notes.json` (`chalk.retry` + `night.retry` + a
   `why`), delete the page from ISSUES Tier 1 #1's list, rebuild the category contact sheet
   (`npm run gen:contact-sheet -- <cat>`), publish it, and commit (one page or one category per
   commit). Push to this branch.

## Decisions made (and why)

* **Why a chalk regen, not a night regen.** The white orb is the chalk's own solid-ink pupil (copied
  from a solid-ink pen); no fill can darken a solid-ink chalk pupil. PR #142's night-only regen is
  exactly the mistake that left stego broken — don't repeat it.
* **Why the geometry note beyond erase-and-redraw.** stego's first erase-and-redraw fixed polarity
  but left an oversized white sclera lobe that, with a fill catchlight, still read half-white
  (composite-eye median 183). The geometry note (big centred pupil, thin even rim) + explicit
  no-fill-catchlight got it to median 19.
* **Detector scoped to band-blind eyes only.** Scoring ringed eyes too re-introduced false positives
  on big-sclera eyes (owl/square looked fine at page scale but the mask landed wrong); ringed eyes
  are already covered by `judgeNightEyes`. Reverted the from-scratch `findEyeCores`+eye-signature
  locator in favour of `scoreEyeFill`'s reference set — see the file's header comment.
* **Erode the pupil mask before measuring.** Light↔night fills register to the pen only within
  ~1-2px; the raw mask leaked onto the sclera and false-flagged good eyes (train/monster). Eroding
  2px drops the rim, keeps interior white.

## Unverified assumptions

* **The non-stego flags are mostly real, but not individually confirmed.** Only `owl-tall` and stego
  were eyeballed. The shape/moon faces especially may be over-flags (big catchlight, small pupil) —
  that's exactly why step 1 is a human review, not an auto-burndown.
* **`gen-coloring-chalk` reliability on these pens is untested.** stego took 1 re-roll at t 0.45;
  other pens (owl's big eyes, the shapes) may need more attempts or a different pupil-size note.
* The night generator's new orb gate has only been exercised on stego; assume it works per its unit
  logic but watch the `⚠ blank-orb eyes` warnings on other pages' regens.

## Done & verified (this session)

* `npm run gen:coloring-fills:audit:eyes` — runs; `orb` column reports; stego `orb: ok`, 17 others
  BLANK-ORB.
* `npm run gen:coloring-fills:audit:eyes:review -- --out /tmp/…` — runs, emits 3.6 MB self-contained
  HTML, 17 cards, no external refs.
* `npm run check:assets:manifest` — 776 assets match (stego night-only change; light untouched).
* `npm run gen:coloring-golden:diff` — 0 regressions after stego re-fix (bgLuma 39.4→27.1 moved).
* `npm run format:check` — clean.
* stego composite eye: median 19 / white 0.16 (was 183); confirmed visually (dark pupil +
  catchlight).

## Risks & next 3 steps

1. **Build + publish the review artifact** (`gen:coloring-fills:audit:eyes:review`), post it, and
   **wait for the user to pick the pages to fix.**
2. On approval, burn down the approved pages with the recipe above — **one page/category per
   commit**, re-running the `orb` audit + `check:assets:manifest` after each.
3. Keep ISSUES Tier 1 #1 in sync (delete each page as it's fixed), and rebuild+publish the affected
   category contact sheets.

*Risk:* over-flags. If the user says a flagged eye is fine, leave it and note it in ISSUES so the
next audit run isn't re-triaged from scratch. *Risk:* API cost — chalk at `--max-attempts 10` ×
night `--samples 4` per page adds up; do the approved list, not all 17 speculatively.

## Reread first

* `tools/asset-gen/lib/composite-eye.mjs` (header comment explains the whole approach + reverted
  ones)
* `tools/asset-gen/fill-src/dinosaur/notes.json` (stego — the copy-me recipe)
* `tools/asset-gen/docs/ISSUES.md` Tier 1 #1 (the class + the flagged list) and Tier 2 #6 (the gate
  closes the eye-scale slice of the contrast gap)
* PR [#142](https://github.com/KyleMit/Splotch/pull/142) comments `#issuecomment-4966853479` (the
  gate) and `#issuecomment-4966306099` (the original dino fix)
* `docs/adrs/` via the `adrs` skill; `tools/asset-gen/docs/pen-chalk-fork.md` (why chalk owns eye
  whites)
