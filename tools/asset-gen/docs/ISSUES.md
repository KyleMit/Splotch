# ISSUES — known outstanding issues in the asset pipeline

The living list of what's known-imperfect right now: defects in shipped assets, gate blind spots,
and tooling gaps. Distinct from [`IDEAS.md`](IDEAS.md) (the exploratory quality backlog, mostly
burned down in [`ideas-exploration/`](../ideas-exploration/README.md)) and `docs/AUDIT.md`
(repo-wide engineering findings). Current as of the
[`gemini-3.1-flash-image` migration](gemini-3.1-migration.md) and the
[fresh-outline regeneration pass](fresh-outline-regen.md) (both 2026-07-13).

Items are ordered by **impact/effort** — the suggested burn-down order, best ratio first — and
tagged by kind (*shipped asset*, *gate blind spot*, *tooling gap*). When you fix one, delete it
(renumbering is expected); when you find one, slot it into the tier its impact/effort deserves.

## Tier 1 — high impact, low effort (do these first)

Everything in this tier is offline — no Gemini key or API budget needed.

1. **Golden-set regression fixtures (IDEAS #23) and the light-asset sha256 manifest (IDEAS #25) are
   still unlanded** *(tooling gap)* — both have ready patches in `ideas-exploration/`, so this is
   promotion, not invention. The 3.1 wave relied on ad-hoc baseline snapshots in a scratchpad
   instead; the next mass regen shouldn't have to.
2. **Promote the exploration auditors to first-class scripts** *(tooling gap)*: the invented-shape
   audit (IDEAS #13) and residual-halo audit (IDEAS #7) proved their worth in the 3.1 wave but must
   be hand-copied out of `ideas-exploration/` to run (and the halo script's main-guard expects its
   original `idea7-…` filename). They belong in `tools/asset-gen/` with `gen:*` entries and
   `scripts-info` descriptions (ADR-0019). Also the stepping stone to gating shape invention (#7).
3. **No per-page notes registry (IDEAS #10)** *(tooling gap)*: the 3.1 wave's customizations
   (police-tall's erase note, circle-wide's contrast note, rectangle-wide's bubble note) live only
   in the [migration record](gemini-3.1-migration.md) — a future regen of those pages will re-fight
   the same battles unless it reads that doc. The validated registry design (auto-loaded
   `fill-src/<cat>/notes.json`) is in `ideas-exploration/idea-10`.

## Tier 2 — solid ratio, a bit more work

4. **`judgeLightEyes` has no false-positive suppressions** *(gate blind spot)*. The IDEAS #12 fixes
   (band-blind annulus, chalk-white-nearby) apply only to the night judge, so light-side flags still
   fire on side-profile eyes (`farm/duck-wide`, verified lively), band-blind solid-pupil pages, and
   non-face cores (windows, hubs — `objects/house-tall`). Options: port the band-blind rule, or
   bless per-page eye annotations (`ideas-exploration/idea-12/code/eye-annotations.draft.json`). Do
   this before #9 — it de-noises the flat-eye list so the burn-down only spends API budget on real
   offenders.
5. **The orphan pages are still uncataloged (IDEAS #24)** *(shipped asset)*: `shapes/heart-wide` and
   `objects/umbrella-tall` have complete, gate-green suites sitting in `ideas-exploration/idea-24/`
   awaiting promotion into `web/static/coloring/` + `books.ts`. Promotion itself is cheap; they are
   2.5-era outputs, so consider regenerating on 3.1 when promoting (that part costs API budget).
6. **Night subject/background contrast is unmeasured** *(gate blind spot)* (`shapes/circle-wide`
   class): a fill can paint the hero region a color indistinguishable from the night sky and pass
   every gate. Caught by montage review this round; a "hero region ΔE vs background" scorer would
   close it, with a known-bad baseline (`circle-wide`'s navy take) to validate against.
7. **Colored-shape invention is only audited, not gated (IDEAS #13)** *(gate blind spot)*: the
   detector that caught `objects/house-tall`'s two invented sky flowers lives in
   `ideas-exploration/idea-13/code/invented-shape-audit.mjs` and ran as a post-wave audit. Until
   it's a generation-time gate (or at least a first-class audit script — #2 covers that half), a
   light fill can ship an invented colored shape that keep/white/eye gates cannot see.

## Tier 3 — high impact but expensive

8. **Chalk whitening on solid-pen-eye pages is gate-blind** *(gate blind spot)* (proved by
   `vehicles/police-tall`, whose wave chalk whitened the pupils with the sclera — that page's
   2026-07-13 fresh pen has ringed pupils now, but the class persists on every remaining
   solid-pen-eye page). A solid pen pupil has no nested rings → `findEyeCores` finds nothing → the
   eye-polarity gate (Stage 1.5 gate 4) passes vacuously, and the night eye judge is silent too (its
   chalk-white-nearby rule trusts the chalk). Only composite review catches it. A candidate scorer:
   chalk-ink fraction inside pen solid regions that sit at face positions. No ready patch — worth
   building before #9's burn-down, since that wave regenerates exactly these pages.
9. **Light-mode eyes on accident-era pens are dead/solid** *(shipped asset; IDEAS #6 — the biggest
   remaining light-theme lever)*. 35 pages carry a light-side flat-eye flag
   (`npm run gen:coloring-fills:audit:eyes` prints them; 53 before the 3.1 regen, 39 before the
   2026-07-13 fresh-outline pass) — though some are detector noise, not defects, which is why #4
   should land first. The root cause is the pen: a solid-ink pupil gives the fill nothing to paint.
   Two proven fixes: pen normalization (`gen:coloring-outlines:normalize`, worst-first) + light-fill
   regen, or a brand-new drawing via `gen:coloring-outlines:fresh` + full-suite regen (the
   2026-07-13 pass cleared the 4 worst real-face offenders — `farm/dog-tall`, `shapes/circle-tall`,
   `vehicles/police-tall`, `objects/teddy-tall` — every one first-take through every downstream
   gate; see `docs/fresh-outline-regen.md`). The biggest remaining real offender is
   `creatures/owl-tall` (blob 2908), deliberately left alone: its celebrated chalk derives from the
   current pen, so it should get a light-only treatment, not a fresh drawing. Night mode is
   unaffected (the chalk owns those whites). **Caveat:** 3.1 resists erase-style edits on solid pen
   ink — its faithfulness works against radical whitening/erase edits (police-tall took an explicit
   erase `--notes`; a 2.5-era chalk did the same edit unprompted). The pen normalizer is exactly
   this kind of edit and has NOT been exercised on 3.1 yet — budget extra attempts/notes the first
   time.
10. **Style covers are still 2.5-era outputs** *(shipped asset)*. The 3.1 migration swapped the
    model in `gen-style-covers.mjs` but did not regenerate covers — no gates exist for them, so a
    regen is an eyeball-only exercise (API cost plus per-cover review). The current covers look
    fine; this is polish.

## Tier 4 — fold into the next regen wave

Neither of these is worth a standalone pass — nothing shipped looks wrong. Land them as
conditioning/gates when the next mass regen happens.

11. **Light↔night and tall↔wide palette coherence are unenforced (IDEAS #8/#9)** *(gate blind
    spot)*: both fills of a page, and both orientations of a subject, are independent generations —
    the 3.1 wave re-rolled every palette. The hue-flip scorers and conditioning recipes in
    `ideas-exploration/idea-8`/`idea-9` were validated but not promoted.
12. **Motif consistency across sibling pages is unenforced (IDEAS #2)** *(gate blind spot)*: the
    same motif can get different treatments per orientation — e.g. `dinosaur/pterodactyl-tall` now
    renders its sun warm gold while `-wide` has a crescent moon. Nothing looked wrong in the 3.1
    review, but every regen re-rolls these calls independently. Cheapest mitigation: record sibling
    motifs in the notes registry (#3) so regens condition on them.
