# ISSUES — known outstanding issues in the asset pipeline

The living list of what's known-imperfect right now: defects in shipped assets, gate blind spots,
and tooling gaps. Distinct from [`IDEAS.md`](IDEAS.md) (the exploratory quality backlog, mostly
burned down in [`ideas-exploration/`](../ideas-exploration/README.md)) and `docs/AUDIT.md`
(repo-wide engineering findings). Current as of the
[`gemini-3.1-flash-image` migration](gemini-3.1-migration.md), the
[fresh-outline regeneration pass](fresh-outline-regen.md), and the dark-mode composite review that
filed the Tier 1 items (all 2026-07-13).

Items are ordered by **impact/effort** — the suggested burn-down order, best ratio first — and
tagged by kind (*shipped asset*, *gate blind spot*, *tooling gap*). When you fix one, delete it
(renumbering is expected); when you find one, slot it into the tier its impact/effort deserves.

## Tier 1 — high impact, low effort (do these first)

All of these came out of the 2026-07-13 dark-mode composite review batches (raws, shipped punches,
and chalk-over-night composites cross-checked per layer). With one exception (#8, which the halo
auditor ranks but nothing reviews), every one passes its gates (`gen:coloring-fills:audit:eyes` →
all ok on every listed page), so nothing but composite review sees them. Each has a seeded registry
entry in `fill-src/<cat>/notes.json` carrying the retry recipe and the composite-review instruction.

1. **Night eyes read as blank white orbs on `dinosaur/stegosaurus-tall` and
   `dinosaur/velociraptor-wide`** *(shipped asset)*: both night fills painted the pupil interior the
   same navy as the night sky and oversized the white catchlight, so in the dark-mode composite (the
   chalk's white sclera + rings over the fill) the eye is a white ring around a hollow — no legible
   dark pupil. This is the #11 contrast gap at eye scale: the audit judges the raw fill's eye cores,
   never the composited result. Cheapest fix in the pipeline: night-fill regen with the seeded
   "solid dark pupil clearly darker than the sky" notes + re-punch — no chalk or pen work.
2. **`nature/ant-tall`'s night ant is green** *(shipped asset)*: the light fill is a proper
   reddish-brown ant; the night fill re-rolled the subject's identity color to green (green head and
   body, tan face), which reads as a different bug entirely. This is #16's light↔night coherence gap
   shipping its first real defect — not a hue nuance but a wrong subject color — and no gate checks
   subject-color plausibility. Same effort class as #1: night-fill regen with the seeded "stay
   reddish-brown like the light fill" notes + re-punch.
3. **The chalk invents facial features — teeth on `farm/duck-wide`, whole faces on
   `objects/apple-wide` + `objects/apple-tall`, eyeballs in `space/ship-tall`'s porthole and all
   FOUR of `space/station-tall`'s windows** *(shipped asset)*: in every case the pen and the light
   fill are clean — a toothless open bill, two faceless apples, empty ring windows (the station's
   light fill colors them as plain amber portholes) — and the chalk drew the feature in (a row of
   human-like teeth; googly cartoon eyes on the wide apple and eerily human lidded eyes on the tall
   one; solid pupil-discs-with-catchlights in every porthole, the station's all glancing sideways),
   after which the night fill dutifully painted it. Dark mode ships anthropomorphized subjects that
   light mode doesn't have. The likely driver is already on file: the chalk instruction is
   EYE-FLAVORED (the `objects/house-wide` registry guard exists because an eyeless scene once made
   2.5 refuse), so on faceless subjects 3.1 helpfully supplies the eyes it was told to expect.
   Triple gate-blind: the invented-shapes audit (#12) only scans the open background, the eye audit
   derives its reference cores from the LIGHT fill so night-only eyes are structurally invisible to
   it, and on ship-tall the eye machinery actively *rewards* the invention (8/8 cores lively, all
   gates green). Fix: chalk regen with the seeded no-face notes (plus a house-wide-style NO-EYES
   guard), then night regen + re-punch — mind #14's caveat (3.1 resists erase edits on solid ink;
   budget extra attempts/notes).
4. **`farm/dog-wide` glows white at night — nose, eye whites, rump patch** *(shipped asset)*: the
   chalk solidified the pen's solid-ink nose **and** the pen's merely-outlined rump patch into solid
   ink, and solid chalk ink renders as glowing white in dark mode (the night fill actually painted
   the patch maroon — the chalk's white sits on top of it); the wide white scleras finish the manic
   look. This is the #13 class escaping the eye: the chalk whitens *any* solid-pen region, and here
   it even promoted an outlined region to solid. Fix: chalk regen with the seeded keep-regions-open
   notes, then night regen + re-punch.
5. **Chalk-whitened night eyes on `farm/horse-wide`, `farm/horse-tall`, `nature/caterpillar-wide`,
   `objects/teddy-tall`, and hollow circle catchlights on `nature/bee-tall`** *(shipped asset)*:
   five more #13 composites in the wild. The horses are textbook — their pens have solid-ink pupils,
   the chalks copied them, and solid chalk ink renders white at night, leaving washed-out white
   eyes. Bee, caterpillar, and teddy are the more alarming variant: their pens have healthy RINGED
   pupils and lively light fills (audit: 6/6, 2/2, and 5-core pages), yet the chalks *introduced*
   the solid/hollow treatment on their own — the bee's chalk drew its catchlights as outlined hollow
   circles, which composite as empty navy rings floating in the eye ("googly bubbles"), and
   teddy-tall's pen is a 2026-07-13 FRESH drawing, proving a brand-new ringed pen does not protect
   the chalk stage. Fix: chalk regen per page with the seeded eye notes (police-wide's
   erase-and-redraw recipe for the horses; keep-the-pen's-rings for bee/caterpillar/teddy), then
   night regen + re-punch.
6. **`objects/flower-wide`'s night face is cross-eyed** *(shipped asset)*: the night fill painted
   both pupils at the inner edge of their eyes (the light fill's are centered), so the flower looks
   cross-eyed in dark mode. Pupil *placement* is invisible to every gate — the cores are lively and
   correctly polarized, just aimed at the nose. Night-fill regen with the seeded centered-pupils
   notes + re-punch.
7. **`vehicles/garbage-tall`'s night fill drew a leaf on the trash can** *(shipped asset)*: the pen,
   the chalk, and the light fill all have a clean slatted bin (the scene's leaves are on the
   ground), but the night fill painted a translucent green leaf emblem across the can's slats — the
   first confirmed FILL-side invention inside the subject (every #3 invention came from the chalk).
   The invented-shapes audit (#12) only scans the open background, so subject-interior invention is
   invisible from either layer. Night-fill regen with the seeded no-emblem notes + re-punch.
   (Unrelated but noted: this page is on #14's light-side flat-eye list — its cab face fails the
   light audit — so a regen wave touching it should consult both entries.)
8. **`vehicles/excavator-tall` ships noisy static around its night lines — and the halo auditor
   already ranks it #2 in the catalog** *(shipped asset + unreviewed audit)*: the raw night fill
   re-inked dark rims/drop-shadows beside its white lines (rawScore 21.9), the punch's chalk-keyed
   mask can't remove ink the chalk never drew, and the crisped chalk overlay is thinner than the
   dirty band — so grainy fringes show around every line in dark mode. This is precisely the class
   `gen:coloring-fills:audit:halo` measures, and the shipped catalog's top of table is
   `space/ship-tall` 8.5 (#3's porthole page — its regen covers this too), excavator-tall 6.5,
   `shapes/rectangle-tall` 4.3, `objects/flower-wide` 4.0 (#6's page), `shapes/heart-tall` 3.2,
   `nature/spider-tall` 2.8, `objects/house-tall` 2.5, `vehicles/fire-tall` 2.4,
   `objects/house-wide` 2.2 — then a clean break to ≤1.3. The auditor is deterministic and offline
   but "a ranking for crop review, not a verdict": nothing reviews its top before shipping, which is
   how the #1 and #2 pages shipped. Fix: night regen for excavator-tall (seeded no-re-inked- lines
   notes), crop-review the rest of the ≥2.2 cluster, and decide a haloScore threshold so the next
   wave gates on it.

## Tier 2 — solid ratio, a bit more work

9. **`judgeLightEyes` has no false-positive suppressions** *(gate blind spot)*. The IDEAS #12 fixes
   (band-blind annulus, chalk-white-nearby) apply only to the night judge, so light-side flags still
   fire on side-profile eyes (`farm/duck-wide`, verified lively), band-blind solid-pupil pages, and
   non-face cores (windows, hubs — `objects/house-tall`). Options: port the band-blind rule, or
   bless per-page eye annotations (`ideas-exploration/idea-12/code/eye-annotations.draft.json`). Do
   this before #14 — it de-noises the flat-eye list so the burn-down only spends API budget on real
   offenders.
10. **The orphan pages are still uncataloged (IDEAS #24)** *(shipped asset)*: `shapes/heart-wide`
    and `objects/umbrella-tall` have complete, gate-green suites sitting in
    `ideas-exploration/idea-24/` awaiting promotion into `web/static/coloring/` + `books.ts`.
    Promotion itself is cheap; they are 2.5-era outputs, so consider regenerating on 3.1 when
    promoting (that part costs API budget).
11. **Night subject/background contrast is unmeasured** *(gate blind spot)* (`shapes/circle-wide`
    class): a fill can paint the hero region a color indistinguishable from the night sky and pass
    every gate. Caught by montage review this round; a "hero region ΔE vs background" scorer would
    close it, with a known-bad baseline (`circle-wide`'s navy take) to validate against.
    (`circle-wide` and `rectangle-wide` now carry contrast `--notes` in the registry, but nothing
    *measures* the result — the gate gap stands. Tier 1 #1 is this same gap at eye scale: a pupil
    painted sky-navy is invisible to every gate too.)
12. **Colored-shape invention is only audited, not gated (IDEAS #13)** *(gate blind spot)*: the
    detector that caught `objects/house-tall`'s two invented sky flowers is now a first-class audit
    (`bin/audit-invented-shapes.mjs`, `npm run gen:coloring-fills:audit:shapes`) but still runs only
    post-hoc. Until the fill generators score each take with it (fold into the keep-best ranking on
    flagged-blob area — the idea-13 report's recommendation), a fill can ship an invented colored
    shape that keep/white/eye gates cannot see, and only the audit-after-the-wave catches it. And
    its scope is the open background only — Tier 1 #3's invented teeth, apple faces, and porthole
    eyeball all sit *inside* the subject, where neither this audit nor any gate looks.

## Tier 3 — high impact but expensive

13. **Chalk whitening on solid-pen-eye pages is gate-blind** *(gate blind spot)* (proved by
    `vehicles/police-tall`, whose wave chalk whitened the pupils with the sclera — that page's
    2026-07-13 fresh pen has ringed pupils now, but the class persists on every remaining
    solid-pen-eye page: Tier 1 #5's horses are two of them). A solid pen pupil has no nested rings →
    `findEyeCores` finds nothing → the eye-polarity gate (Stage 1.5 gate 4) passes vacuously, and
    the night eye judge is silent too (its chalk-white-nearby rule trusts the chalk). Only composite
    review catches it. A candidate scorer: chalk-ink fraction inside pen solid regions that sit at
    face positions. No ready patch — worth building before #14's burn-down, since that wave
    regenerates exactly these pages. (The `vehicles/police-wide` registry entry carries the
    composite-review instruction and the wave's erase-note recipe for the meantime.) Two findings
    prove the class is wider than its name: Tier 1 #4 (`farm/dog-wide`) shows it isn't eye-shaped —
    the chalk whitened a solid nose and even solidified an *outlined* rump patch — and Tier 1 #5's
    bee/caterpillar/teddy show it isn't pen-caused either: their pens have healthy ringed pupils
    (teddy's a 2026-07-13 fresh drawing), yet the chalk solidified them anyway. So a scorer keyed to
    "pen solid regions" misses both extensions — compare chalk ink against PEN ink per region, and
    flag chalk ink the pen doesn't have (which would also catch Tier 1 #3's invented features).
14. **Light-mode eyes on accident-era pens are dead/solid** *(shipped asset; IDEAS #6 — the biggest
    remaining light-theme lever)*. 35 pages carry a light-side flat-eye flag
    (`npm run gen:coloring-fills:audit:eyes` prints them; 53 before the 3.1 regen, 39 before the
    2026-07-13 fresh-outline pass) — though some are detector noise, not defects, which is why #9
    should land first. The list also has **false negatives**: `creatures/mermaid-tall`'s giant
    solid-black orb pupils (straight from the pen) sail through as light-ok because their two
    catchlight holes register as lively cores (2 of 8) — an offender the burn-down list will never
    print, confirmed by eye 2026-07-13. The root cause is the pen: a solid-ink pupil gives the fill
    nothing to paint. Two proven fixes: pen normalization (`gen:coloring-outlines:normalize`,
    worst-first) + light-fill regen, or a brand-new drawing via `gen:coloring-outlines:fresh` +
    full-suite regen (the 2026-07-13 pass cleared the 4 worst real-face offenders — `farm/dog-tall`,
    `shapes/circle-tall`, `vehicles/police-tall`, `objects/teddy-tall` — every one first-take
    through every downstream gate; see `docs/fresh-outline-regen.md`). The biggest remaining real
    offender is `creatures/owl-tall` (blob 2908), deliberately left alone: its celebrated chalk
    derives from the current pen, so it should get a light-only treatment, not a fresh drawing.
    Night mode is unaffected (the chalk owns those whites). **Caveat:** 3.1 resists erase-style
    edits on solid pen ink — its faithfulness works against radical whitening/erase edits
    (police-tall took an explicit erase `--notes`; a 2.5-era chalk did the same edit unprompted).
    The pen normalizer is exactly this kind of edit and has NOT been exercised on 3.1 yet — budget
    extra attempts/notes the first time.
15. **Style covers are still 2.5-era outputs** *(shipped asset)*. The 3.1 migration swapped the
    model in `gen-style-covers.mjs` but did not regenerate covers — no gates exist for them, so a
    regen is an eyeball-only exercise (API cost plus per-cover review). The current covers look
    fine; this is polish.

## Tier 4 — fold into the next regen wave

Neither of these is worth a standalone pass as a *gate* — land them as conditioning/gates when the
next mass regen happens. (The "nothing shipped looks wrong" framing died 2026-07-13: Tier 1 #2's
green ant is #16's gap shipping a real defect. The page fix is Tier 1; the gate stays here.)

16. **Light↔night and tall↔wide palette coherence are unenforced (IDEAS #8/#9)** *(gate blind
    spot)*: both fills of a page, and both orientations of a subject, are independent generations —
    the 3.1 wave re-rolled every palette, and in the worst shipped case re-rolled a subject's
    *identity* color (Tier 1 #2: the night ant turned green). The hue-flip scorers and conditioning
    recipes in `ideas-exploration/idea-8`/`idea-9` were validated but not promoted; none of them
    checks subject-color plausibility, so promotion alone would not have caught the ant — the light
    fill's subject hue is the natural reference.
17. **Motif consistency across sibling pages is unenforced (IDEAS #2)** *(gate blind spot)*: the
    same motif can get different treatments per orientation — e.g. `dinosaur/pterodactyl-tall` now
    renders its sun warm gold while `-wide` has a crescent moon. Nothing looked wrong in the 3.1
    review, but every regen re-rolls these calls independently. The cheapest mitigation is partly in
    place: the notes registry has a per-page `motifs` field and the pterodactyl case is seeded
    (`fill-src/dinosaur/notes.json`) — the generators *print* it, but nothing conditions a regen on
    it yet, so the item stays open until conditioning actually uses it.
