# Idea #2 — Whitened-motif inconsistency across sibling pages

**Verdict: WORKED.** The offline motif-review machinery was built and surfaced more inconsistencies
than IDEAS.md listed, and the proposed fix — re-chalk the outlier with a `--notes` naming the
sibling's treatment — converged to the sibling's thin-ring treatment on the **first Gemini
attempt**, passing every chalk gate. The full loop (re-chalk → night-fill regen → composite) was
validated end-to-end in 4 Gemini calls total.

## What was built (offline, deterministic)

### 1. Whitened-region inventory — `code/motif-whitened-inventory.mjs`

Ran temporarily as `tools/asset-gen/tmp-motif-inventory.mjs` (imports `lib/paths.mjs`,
`lib/morphology.mjs`, so it must live inside `tools/asset-gen/`). Reuses the chalk generator's own
definitions (INK_W=512, INK_DARK=110, PEN_SLACK=2, open-background flood) to compute, per page:
every connected region the chalk whitened (chalk ink beyond the dilated pen strokes, not on the open
background), with area + bbox in 512-space. Runs over all 94 chalked pages in ~40 s, no key/network.
Output: `whitened-inventory.json`.

This is exactly the data the motif pass needs: the bboxes point the crop tool at each whitened
motif, and per-page totals give a cheap outlier heuristic (below).

### 2. Motif contact strip — `code/motif-strip.mjs`

Takes a registry JSON `{ motif: [{ page, bbox512, label, chalk?, night? }] }` and renders one
horizontal strip per motif: top row = the chalk **display** crop (negated, as dark mode shows it),
bottom row = the **night composite** crop (`lib/night-composite.mjs`: chalk-punched night raw +
screened chalk over dark paper). `chalk`/`night` overrides let a strip column point at uncommitted
candidates in `.coloring-samples-dark/`, which is how the before/after comparison was produced. This
is effectively the `--motif bubbles` contact-sheet mode the idea sketched, as a standalone tool.

### 3. Sibling-asymmetry heuristic (one-liner over the inventory)

For each tall/wide pair, the ratio of whitened px. High ratio = the two orientations made very
different whitening calls — a triage list for the strip review (not a gate; some asymmetry is
legitimate composition difference). Top offenders:

| page                 | tall px | wide px | ratio |
| -------------------- | ------- | ------- | ----- |
| space/moon           | 206     | 9086    | 44x   |
| creatures/pegasus    | 138     | 5697    | 41x   |
| nature/spider        | 299     | 11369   | 38x   |
| vehicles/excavator   | 5255    | 222     | 24x   |
| shapes/circle        | 557     | 27      | 21x   |
| farm/duck            | 1092    | 59      | 18x   |
| dinosaur/pterodactyl | 1675    | 109     | 15x   |
| shapes/rectangle     | 216     | 2886    | 13x   |

## Motif findings (before evidence)

* **Bubbles** (`before-bubbles-strip.webp`): CONFIRMED, the clearest outlier.
  `shapes/rectangle-tall` = thin rings, night fill glows teal through them; `shapes/rectangle-wide`
  = fat white donuts with dark cores — at night they read as giant eyeballs, not bubbles.
  (IDEAS.md's "square-wide bubbles" is a misremembering — square-wide has clouds, not bubbles; the
  ring sibling is rectangle-tall.)
* **Sun** (`before-sun-strip.webp`): `dinosaur/pterodactyl-tall`'s rayed sun is chalk-solid white
  (moon-like); `pterodactyl-wide`'s sun is a thin ring the night fill painted **gold**. So no, the
  wide sun does NOT match — but both read well; this is an art-direction call, not an obvious
  defect.
* **Stars** (`before-stars-strip.webp`): `space/moon-wide`'s big face-stars are solid white;
  `space/ship-wide` and `dinosaur/pterodactyl-*`'s stars are thin rings with a warm golden fill
  glow. Inconsistent across the catalog; both treatments look good.
* **Planets** (`before-planets-strip.webp`): `space/ship-wide`'s ringed planet is solid white;
  `space/moon-wide`'s near-identical ringed planet is outlined and glows magenta. Same category,
  same motif, opposite calls — the strongest non-bubble finding.
* **Flowers** (`before-flowers-strip.webp`): `shapes/heart-tall`'s face-flowers have solid white
  petals; `shapes/square-wide`'s flower is outlined (magenta at night). Partially explainable
  (heart-tall's flowers have eye faces), still visibly different treatments inside one category.

## The re-chalk attempt (after evidence)

One run, first attempt passed all four chalk gates:

```
npm run gen:coloring-chalk -- shapes/rectangle-wide --force -t 0.25 --max-attempts 4 \
  --notes "This page has NO eyes and NO faces anywhere. The four floating circles around
  the box are soap BUBBLES, not eyes. Keep every bubble EXACTLY as drawn: a thin outlined
  circle with a small thin catchlight oval inside it. Do NOT fill any bubble or any ring
  around a bubble solid white — no white donuts, no white rings. Nothing on this page
  needs solid white: reproduce the drawing unchanged, all thin lines. (The sibling page
  rectangle-tall keeps its bubbles as thin rings — match that treatment.)"
# -> keep 100.0%  local 100.0%  white 0.0%  invented 0.0022  shift 8,2  (1 try)
```

No `--apply` — the candidate stayed in `.coloring-samples-dark/chalk/`. The note names the motif's
identity ("BUBBLES, not eyes"), the exact target treatment, and the sibling. Low temperature (0.25)
for faithfulness, per the documented lever ladder.

**The coupled night-fill regen is mandatory, and the strip proves why**: compositing the *existing*
night raw under the new chalk shows the fill's own white donut bleeding through as a pale grey ring
— the old fill was generated against the donut chalk and paints white where the new chalk no longer
masks it. So the experiment continued end-to-end: the candidate chalk was temporarily copied over
the shipped `rectangle-wide.chalk.webp` (the night generator reads the shipped path),
`gen-coloring-fills-dark.mjs shapes/rectangle-wide --max-attempts 4` produced a passing fill in 3
tries (drift 0.0000, bgLuma 29, lineW 255), and the shipped chalk was restored via git. Final
composite (`after-bubbles-strip.webp` right columns, `after-full-page-composite.webp`): thin-ring
bubbles with a soft translucent blue glow — structurally matching the sibling's treatment. (The
fill's bubble hue is blue-grey vs the sibling's teal — palette coherence across siblings is idea
#9's territory, not a chalk-treatment issue.)

Gemini budget: 4 calls (1 chalk + 3 night-fill attempts) of the 8-call cap.

## What shipping this for real would look like

1. `npm run gen:coloring-chalk -- shapes/rectangle-wide --force --apply -t 0.25 --notes "…"`
2. Regen the night fill, review on the contact sheet (`--source samples`), copy to
   `fill-src/shapes/rectangle-wide.night.raw.webp`, `npm run gen:coloring-punch -- shapes`.
3. Rebuild + publish the shapes contact sheet; light mode stays byte-identical.

Nothing was shipped here (experiment constraint); the candidates remain in the gitignored
`.coloring-samples-dark/` for any follow-up session to review and ship.

## Limitations

* **Motif grouping is human-in-the-loop.** The inventory finds *whitened regions* automatically, but
  naming them ("these are bubbles") and locating the non-whitened sibling occurrences (thin rings
  leave no whitened region) took eyeballing pen/chalk renders and hand-writing bboxes into the
  registry. Fully automatic motif matching would need shape matching across pages — not worth it for
  a ~5-motif catalog.
* **The sibling-asymmetry ratio is triage, not a gate.** Legitimate composition differences
  (spider-wide's huge web vs -tall) rank high too.
* **Which treatment is "correct" is an art call.** Solid-white stars/sun read as glowing night
  objects and are arguably lovely; the only unambiguous defect found was rectangle-wide's
  eyeball-donut bubbles. A consistency pass should pick a per-motif canon first, then re-chalk
  toward it — the machinery supports either direction.
* **Every chalk fix drags a night-fill regen behind it** (~1–5 extra Gemini calls/page). Budget
  accordingly; the punch and composites are free.
* **bbox512 coordinates are in the 512×512 fit:'fill' space** (distorted for non-square pages) to
  match the inventory/gate machinery; the strip tool converts back to source aspect. Hand-picking
  crops means converting display coords — mildly fiddly.

## Recommendations

1. Ship the rectangle-wide fix (candidates already generated and gate-clean).
2. Adopt the two scripts as a real `tools/asset-gen/` utility (e.g. `audit-motif-consistency.mjs` +
   a committed `motif-registry.json`) — the registry doubles as the "documented checklist" IDEAS.md
   wanted, and per-motif notes could feed idea #10's notes registry.
3. Put the planets pair (`space/ship-wide` vs `moon-wide`) next on the review list; then decide a
   catalog canon for stars/sun (solid-white celestial vs outlined+glow).
