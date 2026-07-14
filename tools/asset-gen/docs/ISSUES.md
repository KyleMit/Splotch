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
cross-checked against the pen. Burn these down before any other tier: #1 needs a chalk regen first,
and #2 is the one page needing pen work. Every item passes all its gates
(`gen:coloring-fills:audit:eyes` → ok on every listed page), so nothing but composite review sees
them. Each page has a seeded registry entry in `fill-src/<cat>/notes.json` carrying the retry recipe
and the composite-review instruction. (The tier originally opened with two night-fill-only regens,
both fixed 2026-07-13 by seeded-notes night regens + re-punch, recipes in
`fill-src/vehicles/notes.json`: `vehicles/garbage-tall`'s fill painted a translucent green leaf
emblem on the trash can — the first confirmed FILL-side invention inside the subject, where no gate
or audit looks — and `vehicles/excavator-tall`'s fill re-inked dark rims beside its white lines,
shipping grainy static around every line in dark mode, haloScore 6.5 → 0.171. The halo-ranking crop
review the excavator item mandated is done; its verdicts and the proposed gate threshold live in
Tier 2 #3. The tier's chalk-invented-faces item — teeth on `farm/duck-wide`, whole faces on both
apples, eyeballs in `space/ship-tall`'s porthole and all four of `space/station-tall`'s windows —
was fixed 2026-07-13/14 by chalk + night regens on all five pages; its class-level findings are
folded into Tier 3 #8 and the per-page recipes live in the farm/objects/space registries. The
`farm/dog-wide` night-glow item — the chalk had solidified the pen's solid-ink nose and
merely-outlined rump patch into solid white, whitened both pupils, and invented mouth teeth — was
fixed 2026-07-14 by a chalk + night regen; recipe in `fill-src/farm/notes.json`, class findings
folded into Tier 3 #8.)

1. **Chalk-whitened night eyes on `farm/horse-wide`, `farm/horse-tall`, `nature/caterpillar-wide`,
   `objects/teddy-tall`, and hollow circle catchlights on `nature/bee-tall`** *(shipped asset)*:
   five more #8 composites in the wild. The horses are textbook — their pens have solid-ink pupils,
   the chalks copied them, and solid chalk ink renders white at night, leaving washed-out white
   eyes. Bee, caterpillar, and teddy are the more alarming variant: their pens have healthy RINGED
   pupils and lively light fills (audit: 6/6, 2/2, and 5-core pages), yet the chalks *introduced*
   the solid/hollow treatment on their own — the bee's chalk drew its catchlights as outlined hollow
   circles, which composite as empty navy rings floating in the eye ("googly bubbles"), and
   teddy-tall's pen is a 2026-07-13 FRESH drawing, proving a brand-new ringed pen does not protect
   the chalk stage. Fix: chalk regen per page with the seeded eye notes (police-wide's
   erase-and-redraw recipe for the horses; keep-the-pen's-rings for bee/caterpillar/teddy), then
   night regen + re-punch.
2. **`creatures/mermaid-tall`'s light eyes are giant solid-black orbs** *(shipped asset)*: the pen
   draws each pupil as solid ink filling nearly the whole eye (only two catchlight holes), so the
   light fill has nothing to paint and the face reads dead-eyed in light mode. This is #9's
   accident-era class, but the flat-eye audit PASSES the page (the catchlight holes register as
   lively cores, 2 of 8) — a false negative the burn-down list will never print, so it must not wait
   for #9's audit-driven wave. The one Tier 1 item needing pen work: normalize the pen
   (`gen:coloring-outlines:normalize`, seeded notes) + light-fill regen — mind #9's caveat (the
   normalizer is unexercised on 3.1; budget extra attempts). Night mode is unaffected (the chalk
   owns those whites).

## Tier 2 — solid ratio, a bit more work

3. **The halo ranking is crop-reviewed but still ungated — wire haloScore into the night generator**
   *(tooling gap)*: `gen:coloring-fills:audit:halo` remains post-hoc, so the re-inked-lines class
   that shipped `vehicles/excavator-tall` (fixed 2026-07-13, haloScore 6.5 → 0.171) can ship again.
   The 2026-07-13 crop review of the whole shipped ≥2.2 cluster is DONE — verdicts (each judged on
   4× chalk-over-night composite crops of the audit's hotspot tiles), so the next session doesn't
   re-review these pages:
   * `space/ship-tall` 8.5 — fixed 2026-07-14 by the chalk-invented-faces regen, 8.5 → 0.026: the
     halo was the same re-inked-rims class as the excavator, and the regen re-proved the recipe
     (this page's takes without "crisp WHITE lines only" + `-t 0.4` measured haloScore 13–17; scored
     pre-ship in scratch, which is exactly the gate this item wants wired in).
   * `shapes/rectangle-tall` 4.3 — hairline re-ink (a thin crisp dark ring the fill traced inside
     the white lines of the pale bubbles/blocks); invisible at display scale, nothing like the
     excavator's wide grainy band. Benign.
   * `shapes/heart-tall` 3.2 — same hairline re-ink on the cream cloud edges; clean at 1×. Benign.
   * `nature/spider-tall` 2.8 — an even navy shadow line under the white web strands on the sage
     web; reads as deliberate depth shading. Deliberate art.
   * `objects/house-tall` 2.5 — a wide, even maroon window-frame ring (deliberate) plus hairline
     mullion edges; clean at 1×. Benign.
   * `vehicles/fire-tall` 2.4 — thin dark edging around the grille bars and eye rings; reads as
     crisp cartoon inking at 1×. Benign.
   * `objects/house-wide` 2.2 — pane-top shading plus hairline mullion edges; clean at 1×. Benign.

   The review calibrates a threshold: REAL user-visible halos sat at shipped haloScore ≥ 6.5
   (excavator 6.5 and ship-tall 8.5, both since fixed to ≤ 0.2), the reviewed-benign band spans
   2.2–4.3 (joined 2026-07-14 by `space/station-tall` at 2.068 — deliberate mid-grey window ring
   bands matching its light fill, rawScore 2.1, clean at 1×), and the clean catalog floor is ≤ 1.3.
   Proposed gate for the next wave: score every NIGHT-take candidate with the halo machinery before
   shipping (punch it against the chalk in scratch) and require haloScore ≤ 2, ranking
   keep-best-of-N by it — the excavator regen's clean takes measured 0.008 and 0.175 while its
   visibly re-inked rejects measured 1.97/rawScore 5.8 and 6.4/22.0, so pair the bar with a
   crop-review flag at rawScore above 5. For the shipped-catalog audit, treat scores above 5 as
   actionable, 2.2–4.3 as this reviewed-benign band, ≤ 1.3 as the floor. Remaining work: wire that
   scoring into `gen-coloring-fills-dark.mjs`'s gates/ranking — nothing gates on it today.
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
   (`circle-wide` and `rectangle-wide` now carry contrast `--notes` in the registry, but nothing
   *measures* the result — the gate gap stands. The 2026-07-13 night-eye fix on
   `dinosaur/stegosaurus-tall` + `dinosaur/velociraptor-wide` was this same gap at eye scale — a
   pupil painted sky-navy composited into a blank white orb and was invisible to every gate; those
   pages are fixed, the gap is not. The 2026-07-13 `objects/flower-wide` regen hit it again at motif
   scale — an unpinned take painted its two small background flowers sky-navy and passed every gate;
   caught by eye and fixed with a palette pin, the gap stays. Ditto the 2026-07-13
   `vehicles/excavator-tall` regen: its first take re-rolled the orange arm teal and the cab face
   navy, caught only by eye and fixed with pinned identity colors.)
7. **Colored-shape invention is only audited, not gated (IDEAS #13)** *(gate blind spot)*: the
   detector that caught `objects/house-tall`'s two invented sky flowers is now a first-class audit
   (`bin/audit-invented-shapes.mjs`, `npm run gen:coloring-fills:audit:shapes`) but still runs only
   post-hoc. Until the fill generators score each take with it (fold into the keep-best ranking on
   flagged-blob area — the idea-13 report's recommendation), a fill can ship an invented colored
   shape that keep/white/eye gates cannot see, and only the audit-after-the-wave catches it. And its
   scope is the open background only — the since-fixed chalk-invented-faces teeth, apple faces, and
   porthole eyeballs (Tier 3 #8's case history) all sat *inside* the subject, where neither this
   audit nor any gate looks, and fills invent inside the subject too, not just chalks: the
   since-fixed `vehicles/garbage-tall` leaf (2026-07-13) and `space/station-tall`'s 2026-07-14 regen
   takes, which painted rows of red rivet-dots on hull bands the pen leaves empty — banned in one
   spot, the dots re-appeared on a different band the next take.

## Tier 3 — high impact but expensive

8. **Chalk whitening on solid-pen-eye pages is gate-blind** *(gate blind spot)* (proved by
   `vehicles/police-tall`, whose wave chalk whitened the pupils with the sclera — that page's
   2026-07-13 fresh pen has ringed pupils now, but the class persists on every remaining
   solid-pen-eye page: Tier 1 #1's horses are two of them). A solid pen pupil has no nested rings →
   `findEyeCores` finds nothing → the eye-polarity gate (Stage 1.5 gate 4) passes vacuously, and the
   night eye judge is silent too (its chalk-white-nearby rule trusts the chalk). Only composite
   review catches it. A candidate scorer: chalk-ink fraction inside pen solid regions that sit at
   face positions. No ready patch — worth building before #9's burn-down, since that wave
   regenerates exactly these pages. (The `vehicles/police-wide` registry entry carries the
   composite-review instruction and the wave's erase-note recipe for the meantime.) Three findings
   prove the class is wider than its name: `farm/dog-wide` (fixed 2026-07-14, recipe in
   `fill-src/farm/notes.json`) showed it isn't eye-shaped — its chalk whitened the pen's solid-ink
   nose AND promoted the pen's merely-outlined rump patch to solid, all at white-budget 0.0% (chalk
   white over pen solid ink counts as no new ink); Tier 1 #1's bee/caterpillar/teddy show it isn't
   pen-caused either: their pens have healthy ringed pupils (teddy's a 2026-07-13 fresh drawing),
   yet the chalk solidified them anyway; and `objects/flower-wide`'s 2026-07-13 fix shows a
   *placement* variant — the chalk invented an asymmetric sclera around a solid pen pupil, leaving
   the fillable pupil hole at the eye's inner edge (cross-eyed at night; originally misfiled as a
   night-fill defect, but the chalk's non-ink opening, not the fill, decides where a pupil can
   appear). So a scorer keyed to "pen solid regions" misses all three extensions — compare chalk ink
   against PEN ink per region, and flag chalk ink the pen doesn't have.

   That chalk-vs-pen-ink comparison would also have caught the tier's biggest fixed case: the
   **chalk-invented-faces class** (teeth in `farm/duck-wide`'s bill; whole faces on
   `objects/apple-wide`/`-tall`; eyeballs in `space/ship-tall`'s porthole and all four
   `space/station-tall` windows — every pen and light fill clean, every feature chalk-drawn, fixed
   2026-07-13/14 by chalk + night regens). Its case history, preserved because this scorer is the
   gate that would catch a recurrence: the driver is the EYE-FLAVORED chalk instruction (it
   describes sclera/pupil/catchlight anatomy, so on faceless subjects 3.1 supplies the eyes it was
   told to expect — the station's double-ring windows match the recipe's anatomy exactly). The class
   is triple gate-blind: the invented-shapes audit (#7) scans only the open background; the eye
   audit derives reference cores from the LIGHT fill, so night-only eyes are structurally invisible;
   and on ship-tall the eye machinery actively *rewarded* the invention — the invented porthole
   eyeball scored 8/8 lively cores, all gates green. Worse, **the invention migrates rather than
   stops**: a note banning the reported feature made the next take invent a *different* interior
   white feature, four times across the fix (duck: teeth banned → second eyeball above the bill;
   apple-wide: face banned → dew-drop dots on the leaf; station: pupils banned → lens-glint dots in
   every window → with dots banned too, whole interiors whitened into eyeballs with black pupil
   dots), because the enclosure gate reads any new white inside a pen-bounded interior as deliberate
   whitening. The proven counter (in the farm/objects/space registries): ban ALL new marks
   everywhere — or, on pages whose correct chalk whitens nothing, ban whitening wholesale ("fill
   NOTHING solid white") — and review the WHOLE chalk display against the pen, not just the reported
   feature.
9. **Light-mode eyes on accident-era pens are dead/solid** *(shipped asset; IDEAS #6 — the biggest
   remaining light-theme lever)*. 35 pages carry a light-side flat-eye flag
   (`npm run gen:coloring-fills:audit:eyes` prints them; 53 before the 3.1 regen, 39 before the
   2026-07-13 fresh-outline pass) — though some are detector noise, not defects, which is why #4
   should land first. The list also has **false negatives**: `creatures/mermaid-tall`'s giant
   solid-black orb pupils sail through as light-ok because their two catchlight holes register as
   lively cores (2 of 8) — an offender the burn-down list will never print, confirmed by eye
   2026-07-13 (its page fix is prioritized as Tier 1 #2). The root cause is the pen: a solid-ink
   pupil gives the fill nothing to paint. Two proven fixes: pen normalization
   (`gen:coloring-outlines:normalize`, worst-first) + light-fill regen, or a brand-new drawing via
   `gen:coloring-outlines:fresh` + full-suite regen (the 2026-07-13 pass cleared the 4 worst
   real-face offenders — `farm/dog-tall`, `shapes/circle-tall`, `vehicles/police-tall`,
   `objects/teddy-tall` — every one first-take through every downstream gate; see
   `docs/fresh-outline-regen.md`). The biggest remaining real offender is `creatures/owl-tall` (blob
   2908), deliberately left alone: its celebrated chalk derives from the current pen, so it should
   get a light-only treatment, not a fresh drawing. Night mode is unaffected (the chalk owns those
   whites). **Caveat:** 3.1 resists erase-style edits on solid pen ink — its faithfulness works
   against radical whitening/erase edits (police-tall took an explicit erase `--notes`; a 2.5-era
   chalk did the same edit unprompted). The pen normalizer is exactly this kind of edit and has NOT
   been exercised on 3.1 yet — budget extra attempts/notes the first time.
10. **Style covers are still 2.5-era outputs** *(shipped asset)*. The 3.1 migration swapped the
    model in `gen-style-covers.mjs` but did not regenerate covers — no gates exist for them, so a
    regen is an eyeball-only exercise (API cost plus per-cover review). The current covers look
    fine; this is polish.

## Tier 4 — fold into the next regen wave

Neither of these is worth a standalone pass as a *gate* — land them as conditioning/gates when the
next mass regen happens. (The "nothing shipped looks wrong" framing died 2026-07-13: #11's gap
shipped a real defect — `nature/ant-tall`'s night ant turned green. That page was regenerated
reddish-brown the same day; the gate gap stays here.)

11. **Light↔night and tall↔wide palette coherence are unenforced (IDEAS #8/#9)** *(gate blind
    spot)*: both fills of a page, and both orientations of a subject, are independent generations —
    the 3.1 wave re-rolled every palette, and in the worst shipped case re-rolled a subject's
    *identity* color (`nature/ant-tall`'s night ant turned green; the page was fixed 2026-07-13 by a
    seeded-notes night regen, but only human review caught it — the gap stays open). The hue-flip
    scorers and conditioning recipes in `ideas-exploration/idea-8`/`idea-9` were validated but not
    promoted; none of them checks subject-color plausibility, so promotion alone would not have
    caught the ant — the light fill's subject hue is the natural reference.
12. **Motif consistency across sibling pages is unenforced (IDEAS #2)** *(gate blind spot)*: the
    same motif can get different treatments per orientation — e.g. `dinosaur/pterodactyl-tall` now
    renders its sun warm gold while `-wide` has a crescent moon. Nothing looked wrong in the 3.1
    review, but every regen re-rolls these calls independently. The cheapest mitigation is partly in
    place: the notes registry has a per-page `motifs` field and the pterodactyl case is seeded
    (`fill-src/dinosaur/notes.json`) — the generators *print* it, but nothing conditions a regen on
    it yet, so the item stays open until conditioning actually uses it.
