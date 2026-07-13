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

## Tier 1 — reported in the 2026-07-13 review pass — fix these before everything else

Every page in this tier was flagged by a human in the 2026-07-13 dark-mode review (four batches, 18
pages) and then verified per layer — raws, shipped punches, and chalk-over-night composites
cross-checked against the pen. Burn these down before any other tier: #1 is a night-fill-only regen
(the cheapest fix in the pipeline), #2–#4 need a chalk regen first, and #5 is the one page needing
pen work. With one exception (#1, which the halo auditor ranks but nothing reviews), every item
passes all its gates (`gen:coloring-fills:audit:eyes` → ok on every listed page), so nothing but
composite review sees them. Each page has a seeded registry entry in `fill-src/<cat>/notes.json`
carrying the retry recipe and the composite-review instruction. (The tier originally opened with
`vehicles/garbage-tall`'s night fill painting a translucent green leaf emblem on the trash can — the
first confirmed FILL-side invention inside the subject, where no gate or audit looks; fixed
2026-07-13 by a seeded-notes night regen + re-punch, recipe in `fill-src/vehicles/notes.json`.)

1. **`vehicles/excavator-tall` ships noisy static around its night lines — and the halo auditor
   already ranks it #2 in the catalog** *(shipped asset + unreviewed audit)*: the raw night fill
   re-inked dark rims/drop-shadows beside its white lines (rawScore 21.9), the punch's chalk-keyed
   mask can't remove ink the chalk never drew, and the crisped chalk overlay is thinner than the
   dirty band — so grainy fringes show around every line in dark mode. This is precisely the class
   `gen:coloring-fills:audit:halo` measures, and the shipped catalog's top of table is
   `space/ship-tall` 8.5 (#2's porthole page — its regen covers this too), excavator-tall 6.5,
   `shapes/rectangle-tall` 4.3, `shapes/heart-tall` 3.2, `nature/spider-tall` 2.8,
   `objects/house-tall` 2.5, `vehicles/fire-tall` 2.4, `objects/house-wide` 2.2 — then a clean break
   to ≤1.3. (`objects/flower-wide`, formerly 4.0 in this cluster, dropped to 0.2 with its 2026-07-13
   chalk+night regen.) The auditor is deterministic and offline but "a ranking for crop review, not
   a verdict": nothing reviews its top before shipping, which is how this page (and the since-fixed
   garbage-tall leaf) shipped. Fix: night regen for excavator-tall (seeded no-re-inked-lines notes),
   crop-review the rest of the ≥2.2 cluster, and decide a haloScore threshold so the next wave gates
   on it.
2. **The chalk invents facial features — teeth on `farm/duck-wide`, whole faces on
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
   Triple gate-blind: the invented-shapes audit (#9) only scans the open background, the eye audit
   derives its reference cores from the LIGHT fill so night-only eyes are structurally invisible to
   it, and on ship-tall the eye machinery actively *rewards* the invention (8/8 cores lively, all
   gates green). Fix: chalk regen with the seeded no-face notes (plus a house-wide-style NO-EYES
   guard), then night regen + re-punch — mind #11's caveat (3.1 resists erase edits on solid ink;
   budget extra attempts/notes).
3. **`farm/dog-wide` glows white at night — nose, eye whites, rump patch** *(shipped asset)*: the
   chalk solidified the pen's solid-ink nose **and** the pen's merely-outlined rump patch into solid
   ink, and solid chalk ink renders as glowing white in dark mode (the night fill actually painted
   the patch maroon — the chalk's white sits on top of it); the wide white scleras finish the manic
   look. This is the #10 class escaping the eye: the chalk whitens *any* solid-pen region, and here
   it even promoted an outlined region to solid. Fix: chalk regen with the seeded keep-regions-open
   notes, then night regen + re-punch.
4. **Chalk-whitened night eyes on `farm/horse-wide`, `farm/horse-tall`, `nature/caterpillar-wide`,
   `objects/teddy-tall`, and hollow circle catchlights on `nature/bee-tall`** *(shipped asset)*:
   five more #10 composites in the wild. The horses are textbook — their pens have solid-ink pupils,
   the chalks copied them, and solid chalk ink renders white at night, leaving washed-out white
   eyes. Bee, caterpillar, and teddy are the more alarming variant: their pens have healthy RINGED
   pupils and lively light fills (audit: 6/6, 2/2, and 5-core pages), yet the chalks *introduced*
   the solid/hollow treatment on their own — the bee's chalk drew its catchlights as outlined hollow
   circles, which composite as empty navy rings floating in the eye ("googly bubbles"), and
   teddy-tall's pen is a 2026-07-13 FRESH drawing, proving a brand-new ringed pen does not protect
   the chalk stage. Fix: chalk regen per page with the seeded eye notes (police-wide's
   erase-and-redraw recipe for the horses; keep-the-pen's-rings for bee/caterpillar/teddy), then
   night regen + re-punch.
5. **`creatures/mermaid-tall`'s light eyes are giant solid-black orbs** *(shipped asset)*: the pen
   draws each pupil as solid ink filling nearly the whole eye (only two catchlight holes), so the
   light fill has nothing to paint and the face reads dead-eyed in light mode. This is #11's
   accident-era class, but the flat-eye audit PASSES the page (the catchlight holes register as
   lively cores, 2 of 8) — a false negative the burn-down list will never print, so it must not wait
   for #11's audit-driven wave. The one Tier 1 item needing pen work: normalize the pen
   (`gen:coloring-outlines:normalize`, seeded notes) + light-fill regen — mind #11's caveat (the
   normalizer is unexercised on 3.1; budget extra attempts). Night mode is unaffected (the chalk
   owns those whites).

## Tier 2 — solid ratio, a bit more work

6. **`judgeLightEyes` has no false-positive suppressions** *(gate blind spot)*. The IDEAS #12 fixes
   (band-blind annulus, chalk-white-nearby) apply only to the night judge, so light-side flags still
   fire on side-profile eyes (`farm/duck-wide`, verified lively), band-blind solid-pupil pages, and
   non-face cores (windows, hubs — `objects/house-tall`). Options: port the band-blind rule, or
   bless per-page eye annotations (`ideas-exploration/idea-12/code/eye-annotations.draft.json`). Do
   this before #11 — it de-noises the flat-eye list so the burn-down only spends API budget on real
   offenders.
7. **The orphan pages are still uncataloged (IDEAS #24)** *(shipped asset)*: `shapes/heart-wide` and
   `objects/umbrella-tall` have complete, gate-green suites sitting in `ideas-exploration/idea-24/`
   awaiting promotion into `web/static/coloring/` + `books.ts`. Promotion itself is cheap; they are
   2.5-era outputs, so consider regenerating on 3.1 when promoting (that part costs API budget).
8. **Night subject/background contrast is unmeasured** *(gate blind spot)* (`shapes/circle-wide`
   class): a fill can paint the hero region a color indistinguishable from the night sky and pass
   every gate. Caught by montage review this round; a "hero region ΔE vs background" scorer would
   close it, with a known-bad baseline (`circle-wide`'s navy take) to validate against.
   (`circle-wide` and `rectangle-wide` now carry contrast `--notes` in the registry, but nothing
   *measures* the result — the gate gap stands. The 2026-07-13 night-eye fix on
   `dinosaur/stegosaurus-tall` + `dinosaur/velociraptor-wide` was this same gap at eye scale — a
   pupil painted sky-navy composited into a blank white orb and was invisible to every gate; those
   pages are fixed, the gap is not. The 2026-07-13 `objects/flower-wide` regen hit it again at motif
   scale — an unpinned take painted its two small background flowers sky-navy and passed every gate;
   caught by eye and fixed with a palette pin, the gap stays.)
9. **Colored-shape invention is only audited, not gated (IDEAS #13)** *(gate blind spot)*: the
   detector that caught `objects/house-tall`'s two invented sky flowers is now a first-class audit
   (`bin/audit-invented-shapes.mjs`, `npm run gen:coloring-fills:audit:shapes`) but still runs only
   post-hoc. Until the fill generators score each take with it (fold into the keep-best ranking on
   flagged-blob area — the idea-13 report's recommendation), a fill can ship an invented colored
   shape that keep/white/eye gates cannot see, and only the audit-after-the-wave catches it. And its
   scope is the open background only — Tier 1 #2's invented teeth, apple faces, and porthole
   eyeballs all sit *inside* the subject, where neither this audit nor any gate looks (and the
   since-fixed `vehicles/garbage-tall` leaf proved 2026-07-13 that fills invent inside the subject
   too, not just chalks).

## Tier 3 — high impact but expensive

10. **Chalk whitening on solid-pen-eye pages is gate-blind** *(gate blind spot)* (proved by
    `vehicles/police-tall`, whose wave chalk whitened the pupils with the sclera — that page's
    2026-07-13 fresh pen has ringed pupils now, but the class persists on every remaining
    solid-pen-eye page: Tier 1 #4's horses are two of them). A solid pen pupil has no nested rings →
    `findEyeCores` finds nothing → the eye-polarity gate (Stage 1.5 gate 4) passes vacuously, and
    the night eye judge is silent too (its chalk-white-nearby rule trusts the chalk). Only composite
    review catches it. A candidate scorer: chalk-ink fraction inside pen solid regions that sit at
    face positions. No ready patch — worth building before #11's burn-down, since that wave
    regenerates exactly these pages. (The `vehicles/police-wide` registry entry carries the
    composite-review instruction and the wave's erase-note recipe for the meantime.) Three findings
    prove the class is wider than its name: Tier 1 #3 (`farm/dog-wide`) shows it isn't eye-shaped —
    the chalk whitened a solid nose and even solidified an *outlined* rump patch; Tier 1 #4's
    bee/caterpillar/teddy show it isn't pen-caused either: their pens have healthy ringed pupils
    (teddy's a 2026-07-13 fresh drawing), yet the chalk solidified them anyway; and
    `objects/flower-wide`'s 2026-07-13 fix shows a *placement* variant — the chalk invented an
    asymmetric sclera around a solid pen pupil, leaving the fillable pupil hole at the eye's inner
    edge (cross-eyed at night; originally misfiled as a night-fill defect, but the chalk's non-ink
    opening, not the fill, decides where a pupil can appear). So a scorer keyed to "pen solid
    regions" misses all three extensions — compare chalk ink against PEN ink per region, and flag
    chalk ink the pen doesn't have (which would also catch Tier 1 #2's invented features).
11. **Light-mode eyes on accident-era pens are dead/solid** *(shipped asset; IDEAS #6 — the biggest
    remaining light-theme lever)*. 35 pages carry a light-side flat-eye flag
    (`npm run gen:coloring-fills:audit:eyes` prints them; 53 before the 3.1 regen, 39 before the
    2026-07-13 fresh-outline pass) — though some are detector noise, not defects, which is why #6
    should land first. The list also has **false negatives**: `creatures/mermaid-tall`'s giant
    solid-black orb pupils sail through as light-ok because their two catchlight holes register as
    lively cores (2 of 8) — an offender the burn-down list will never print, confirmed by eye
    2026-07-13 (its page fix is prioritized as Tier 1 #5). The root cause is the pen: a solid-ink
    pupil gives the fill nothing to paint. Two proven fixes: pen normalization
    (`gen:coloring-outlines:normalize`, worst-first) + light-fill regen, or a brand-new drawing via
    `gen:coloring-outlines:fresh` + full-suite regen (the 2026-07-13 pass cleared the 4 worst
    real-face offenders — `farm/dog-tall`, `shapes/circle-tall`, `vehicles/police-tall`,
    `objects/teddy-tall` — every one first-take through every downstream gate; see
    `docs/fresh-outline-regen.md`). The biggest remaining real offender is `creatures/owl-tall`
    (blob 2908), deliberately left alone: its celebrated chalk derives from the current pen, so it
    should get a light-only treatment, not a fresh drawing. Night mode is unaffected (the chalk owns
    those whites). **Caveat:** 3.1 resists erase-style edits on solid pen ink — its faithfulness
    works against radical whitening/erase edits (police-tall took an explicit erase `--notes`; a
    2.5-era chalk did the same edit unprompted). The pen normalizer is exactly this kind of edit and
    has NOT been exercised on 3.1 yet — budget extra attempts/notes the first time.
12. **Style covers are still 2.5-era outputs** *(shipped asset)*. The 3.1 migration swapped the
    model in `gen-style-covers.mjs` but did not regenerate covers — no gates exist for them, so a
    regen is an eyeball-only exercise (API cost plus per-cover review). The current covers look
    fine; this is polish.

## Tier 4 — fold into the next regen wave

Neither of these is worth a standalone pass as a *gate* — land them as conditioning/gates when the
next mass regen happens. (The "nothing shipped looks wrong" framing died 2026-07-13: #13's gap
shipped a real defect — `nature/ant-tall`'s night ant turned green. That page was regenerated
reddish-brown the same day; the gate gap stays here.)

13. **Light↔night and tall↔wide palette coherence are unenforced (IDEAS #8/#9)** *(gate blind
    spot)*: both fills of a page, and both orientations of a subject, are independent generations —
    the 3.1 wave re-rolled every palette, and in the worst shipped case re-rolled a subject's
    *identity* color (`nature/ant-tall`'s night ant turned green; the page was fixed 2026-07-13 by a
    seeded-notes night regen, but only human review caught it — the gap stays open). The hue-flip
    scorers and conditioning recipes in `ideas-exploration/idea-8`/`idea-9` were validated but not
    promoted; none of them checks subject-color plausibility, so promotion alone would not have
    caught the ant — the light fill's subject hue is the natural reference.
14. **Motif consistency across sibling pages is unenforced (IDEAS #2)** *(gate blind spot)*: the
    same motif can get different treatments per orientation — e.g. `dinosaur/pterodactyl-tall` now
    renders its sun warm gold while `-wide` has a crescent moon. Nothing looked wrong in the 3.1
    review, but every regen re-rolls these calls independently. The cheapest mitigation is partly in
    place: the notes registry has a per-page `motifs` field and the pterodactyl case is seeded
    (`fill-src/dinosaur/notes.json`) — the generators *print* it, but nothing conditions a regen on
    it yet, so the item stays open until conditioning actually uses it.
