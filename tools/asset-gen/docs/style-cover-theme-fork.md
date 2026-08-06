# Fork the AI Style Covers per Theme — a Second Render, Not a Filter

**Decision record** — in force. **Date:** 2026-08

## Context

The style picker's eight covers (`web/static/styles/`) advertise what the AI button will do to a
child's drawing. They were generated once, from `source.svg` on implicit white paper, and served to
both themes — so dark mode showed eight bright squares floating on `--app-bg`, behind a
`background: #fcfbf8` plate the raw-hex lint allowlisted as "baked-light".

Three of them were worse than merely bright: Crayon, Watercolor, and Felt had a **paper margin baked
into the pixels**, because their prompt suffixes never carried the "fill the whole frame edge to
edge" clause that Paper and Clay already ended in. The matte was wrong in light mode too; the dark
ground is just what made it obvious.

Alternatives considered for the dark side:

* **Filter the light covers** the way the coloring picker tiles do (`--lineart-filter: invert(1)` +
  `mix-blend-mode`). That treatment is only valid for black-on-white line art. These are full-color
  renders; inverting one turns a green hill magenta.
* **Ship one light set and accept the bright squares**, the standing tradeoff for every other
  photographic surface in the app (`AiImageResult`'s stage, `.polaroid-image`). Cheapest, and the
  covers would keep telling the truth about what `/api/generate-image` returns.
* **Fork the covers *and* the endpoint**, so a drawing made in dark mode comes back as a night
  scene.

## Decision

**Fork the covers; leave the endpoint pinned to light.**

Each style now has two committed renders, `{style}.{light,dark}.webp`, following the accepted
convention in [`asset-naming.md`](asset-naming.md) rather than the base-name form that record
rejected — so no tool has to identify a variant by exclusion. `styleThumbPath(style, theme)` builds
the app's URL and `gen-style-covers.mjs` reuses it to place the file, so the route and the output
path cannot drift.

A dark cover is made of two halves, and it needs both:

* **Dark paper.** `gen-style-covers.mjs` flattens `source.svg` onto `PAPER_COLORS[theme]` before the
  model sees it. On dark paper the model reads the drawing as a night scene on its own — but only
  the *sky*. The ground stays broad daylight, and the paper-craft style ignores the change
  completely. Half a conversion.
* **A night clause.** `buildPromptForStyle` appends `DARK_SCENE_PROMPT` after the style suffix,
  modelled on [`lib/prompts.mjs`](../lib/prompts.mjs)'s `darkFillPrompt`: night by color and light
  alone, living things darkened rather than drained, nothing invented.

Five styles take that unchanged. Three carry a `DARK_STYLE_SUFFIXES` override, because a night
clause recolors a scene but **cannot re-stage a craft**: Crayon becomes wax on black construction
paper, Paper swaps its off-white sheet for charcoal, and Clay has to declare the scene one
continuous mass — on a dark ground the model reads every silhouette as an outline and the sculpted
forms flatten into stacked cutouts.

**Sticker has no backdrop at all.** It is the one style whose backdrop was never scenery — a white
die-cut band needs something behind it, and whatever we baked in was wrong in one theme or the
other. So it is generated on a **chroma-key field** that `lib/flat-background-punch.mjs` floods away
from the border, and ships as RGBA with the field transparent, letting the picker's own `--paper`
show through in both themes. The shadow that used to be baked into the render is drawn in CSS
instead, where it sits on the silhouette rather than on a plate. `PUNCHED_BACKGROUND_STYLES` is the
one list both sides read.

The key is seeded from the border and spreads only through connected backdrop, so a matching color
*inside* the artwork is never cut away. The field is **magenta**, not grey: an early grey field came
back near-white, the flood fill could not tell it from the white die-cut band, and it ate both — the
sticker shipped with no border at all. A backdrop color that cannot occur in the subject is the
whole trick.

The endpoint stays on `'light'`, with the reasoning at the call site. The request carries no theme,
and adding one is a decision about what the button *produces* — not about how the picker looks.

## Consequences

* **The covers currently over-promise in dark mode.** A player sees eight moonlit covers and gets
  back a daylight picture. This is the known, deliberate cost of shipping the fork without the
  endpoint; closing it means threading the resolved theme through the request and validating it
  server-side.
* **Two prompt fixes were subtractive, and will look removable to someone tidying up.** They are
  not:
  * **Crayon's dark suffix insists only the *paper* is dark.** Without that, the model reads "night"
    as an instruction to dim the drawing, and returns mud or hollow outlines with the ground showing
    through. Four rolls to find it.
  * **Paper's dark suffix has no "photographed from above … lay it on a background".** That staging
    language is what kept inventing a mounted card to photograph, and no amount of "no border, no
    mount, no frame" overrode it — deleting the staging did, on the roll after. Six rolls.
* **A cover is judged on `--paper`, never on white.** The two failure modes that survive a contact
  sheet are a night render drifting bright enough to read as daylight and a cutout whose die-cut
  band disappears into the surface behind it. Both are invisible against a neutral review background
  and obvious against the real one.
* **Re-roll before rewriting.** Crayon burned more rolls than every other style combined, across
  four rewrites of its suffix — flat, then hollow and muddy, then too bright, then flat again. What
  finally settled it was re-rolling an *unchanged* prompt at a lower temperature: the wording had
  been adequate for rounds, and each rewrite was chasing sampling noise. When a render disappoints,
  take a second sample at `--temperature 0.7` before concluding the prompt is wrong — one roll
  cannot tell a bad prompt from a bad draw.
* **Above about temperature 1.0 these styles start inventing.** Seen at 1.0 and 1.35 on Paper (a
  sleeping fox; hatching drawn onto the mountains, which its own suffix forbids) and on Crayon (a
  heart). Raise the temperature to break out of a rut, then come back down to pick the keeper.
* **The shipped Crayon draws its sun as a gibbous moon**, and the suffix still says "sun" because
  the source drawing has one. That substitution was accepted on review rather than asked for, so a
  later regeneration returning an actual sun is correct, not a regression.
* **Cutouts are fitted with `contain`, not `cover`.** Cropping to fill shaves the die-cut band off
  whichever edge the model drew closest, and the band is the whole point of the style.
* **`punchedFraction` is a cheap failure detector.** A run that keys far too little or far too much
  means the model gave us a shadowed, textured, or absent backdrop, and the generator says so per
  cover instead of shipping a ghost.
* **`theme.ts` is now on the sanctioned `web/src` import list** ([`README.md`](README.md)) and
  spells its own tokens import with an explicit `.ts`, because bare Node under
  `--experimental-strip-types` will not resolve an extensionless specifier the way Vite does.
* **`AiImagePrompt.svelte` left the raw-hex allowlist** in `scripts/lint-token-styles.mjs`: its
  paper-white plate is `var(--paper)` now that both themes have real art behind it.
* **Sticker still ships two variants even though its backdrop is gone.** The band and the cut are
  identical; what differs is the scene inside it, which the night clause recolors like any other
  style. Only the plate stopped being a per-theme decision.
* Adding a third theme means a third full cover set: `styles.test.ts` derives its expectations from
  `PAPER_COLORS`, so it fails rather than letting one theme's art silently serve another.
