# Prompts

## Coloring-page pen outlines (missing orientation)

Recipe proven by the idea-24 orphan-page run (`tools/asset-gen/ideas-exploration/idea-24/`): when a
page has one orientation and needs the other, condition Gemini on the **existing sibling
orientation** as an image input (far stronger style anchoring than any text description) and request
the target aspect ratio explicitly via `config.imageConfig.aspectRatio` (`'3:2'` wide / `'2:3'`
tall). Normalize the output to the pen contract afterwards: resize to exact page dims (1536x1024 /
1024x1536), `b-w` colourspace + normalise, webp q90.

```md
This image is one page of a toddler coloring book: clean black pen outlines on a pure white
background, medium line weight, no shading, no grey, no color, no text.

Draw a NEW page of the SAME coloring book showing the SAME subject, recomposed for a {LANDSCAPE
(wider than tall) | PORTRAIT (taller than wide)} page ({3:2 | 2:3} aspect ratio).

RULES:

* Keep the identical drawing style: the same pen stroke weight, the same simple rounded shapes, the
  same level of detail (very simple — this is for a 2-year-old).
* Keep the same subject and supporting elements, rearranged naturally to fill the {LANDSCAPE |
  PORTRAIT} composition with generous margins.
* Every shape must be a closed thin outline that can be colored in. NO solid black regions, no
  filled areas, no shading, no cross-hatching.
* Pure white background, pure black lines only. No text, letters, numbers, signature, or border
  frame.
```

Lesson from the run: the model defaults to reproducing the *reference's* composition even on a
differently shaped canvas (big empty side margins). Append an explicit fill-the-axis note from the
start, e.g. "FILL THE WHOLE LANDSCAPE WIDTH … flowers across the ENTIRE bottom edge". The reference
script is `tools/asset-gen/ideas-exploration/idea-24/code/gen-pen-idea24.mjs` — a candidate for
promotion to a real `gen:coloring-pen` script.

## Coloring-page scenes (cover, portrait, landscape)

The hand-authoring prompts behind the committed coloring-book art in `web/static/coloring/` — one
per aspect ratio the catalog ships (square category cover, `2:3` portrait page, `3:2` landscape
page; see `web/src/lib/state/books.ts`). Each block is self-contained: paste one, then append the
subject after the trailing `## Image` heading. The shared `## Style Rules` half is the toddler
line-art contract every page must satisfy — thick closed outlines, no grey, no text, generous safe
margins — and only the `## Aspect ratio and composition` half differs between the three.

For turning an existing page into its missing sibling orientation, prefer the image-conditioned
recipe above; these text-only prompts are for drawing a page from scratch.

### Cover (1:1)

```md
## Style Rules

Create a coloring-page background image for a kids digital coloring app.

The image should be designed for a 3-year-old. Use a simple, cheerful, toddler-friendly
coloring-book style with black and white line art only. Use thick, clean outlines, rounded friendly
shapes, minimal detail, and large open spaces that are easy to color.

Do not use color. Do not use gray tones. Do not use shading, gradients, crosshatching, shadows,
textures, or filled black areas. Do not include any text, letters, numbers, words, labels, captions,
logos, signatures, watermarks, symbols that look like writing, or UI elements.

Keep the scene uncluttered and easy to understand at a glance. Use one clear main idea or focal
subject. Supporting elements should be simple, playful, and sparse. Avoid tiny objects, intricate
patterns, dense backgrounds, realistic detail, complex scenery, or too many small decorations.

Leave sufficient empty margin around all edges of the image. No important subject, character,
object, face, limb, prop, or decorative element should touch or be cut off by the edge of the image.

The image should feel like part of a consistent collection: simple toddler coloring pages with thick
outlines, friendly shapes, open coloring areas, clean playful compositions, and generous safe
margins.

Do not include a border line. Just the image

## Aspect ratio and composition

Create this image in a square 1:1 aspect ratio.

This is a category cover image, so it should represent the overall theme of the category rather than
focusing on only one isolated subject. It does not need to show every item in the category. Instead,
create a simple, appealing preview scene that clearly sells the concept of what is inside the
category.

Make good use of the square space. Keep the main theme centered and balanced, with the most
important elements near the middle. Use a few simple supporting elements around the main subject to
make the cover feel complete, but keep the scene uncluttered and toddler-friendly.

Leave generous safe margins on all four sides. Keep all important content fully inside the frame,
with no animals, characters, objects, or decorative elements cropped by the edges.

The image should feel like a cover or tile for the category, not a busy poster.

## Image
```

### Portrait (2:3)

```md
## Style Rules

Create a coloring-page background image for a kids digital coloring app.

The image should be designed for a 3-year-old. Use a simple, cheerful, toddler-friendly
coloring-book style with black and white line art only. Use thick, clean outlines, rounded friendly
shapes, minimal detail, and large open spaces that are easy to color.

Do not use color. Do not use gray tones. Do not use shading, gradients, crosshatching, shadows,
textures, or filled black areas. Do not include any text, letters, numbers, words, labels, captions,
logos, signatures, watermarks, symbols that look like writing, or UI elements.

Keep the scene uncluttered and easy to understand at a glance. Use one clear main idea or focal
subject. Supporting elements should be simple, playful, and sparse. Avoid tiny objects, intricate
patterns, dense backgrounds, realistic detail, complex scenery, or too many small decorations.

Leave sufficient empty margin around all edges of the image. No important subject, character,
object, face, limb, prop, or decorative element should touch or be cut off by the edge of the image.

The image should feel like part of a consistent collection: simple toddler coloring pages with thick
outlines, friendly shapes, open coloring areas, clean playful compositions, and generous safe
margins.

Do not include a border line. Just the image

## Aspect ratio and composition

Create this image in a portrait 2:3 aspect ratio.

The composition should be designed specifically for a tall vertical frame. Make the main subject
large and prominent, naturally using the height of the image. For a single character, animal, or
object, place it near the center or slightly lower-center so it feels grounded and fills the
portrait space well.

Use simple vertical or stacked supporting elements above and below the subject, such as clouds,
stars, leaves, flowers, bubbles, snowflakes, trees, hills, grass, or other theme-appropriate
details. These supporting elements should help the tall image feel complete without becoming busy.

Leave generous safe margins on all four sides, especially above the head or top of the main subject
and below the feet or bottom of the main subject. No important content should touch or be cut off by
the image edges.

Avoid leaving the top or bottom feeling empty. Avoid spreading important details too far to the
sides. The image should feel intentionally composed for portrait orientation, not like a square
image cropped taller.

## Image
```

### Landscape (3:2)

```md
## Style Rules

Create a coloring-page background image for a kids digital coloring app.

The image should be designed for a 3-year-old. Use a simple, cheerful, toddler-friendly
coloring-book style with black and white line art only. Use thick, clean outlines, rounded friendly
shapes, minimal detail, and large open spaces that are easy to color.

Do not use color. Do not use gray tones. Do not use shading, gradients, crosshatching, shadows,
textures, or filled black areas. Do not include any text, letters, numbers, words, labels, captions,
logos, signatures, watermarks, symbols that look like writing, or UI elements.

Keep the scene uncluttered and easy to understand at a glance. Use one clear main idea or focal
subject. Supporting elements should be simple, playful, and sparse. Avoid tiny objects, intricate
patterns, dense backgrounds, realistic detail, complex scenery, or too many small decorations.

Leave sufficient empty margin around all edges of the image. No important subject, character,
object, face, limb, prop, or decorative element should touch or be cut off by the edge of the image.

The image should feel like part of a consistent collection: simple toddler coloring pages with thick
outlines, friendly shapes, open coloring areas, clean playful compositions, and generous safe
margins.

Do not include a border line. Just the image

## Aspect ratio and composition

Create this image in a landscape 3:2 aspect ratio.

The composition should be designed specifically for a wide horizontal frame. Make the main subject
large and easy to recognize, but use the width of the image with simple playful supporting elements
on the left and right.

For a single character, animal, or object, place the main subject near the center or slightly
off-center, then balance the scene with theme-appropriate side elements such as trees, hills,
flowers, clouds, fences, toys, stars, bubbles, snowflakes, rocks, plants, or simple background
shapes.

The side elements should help the image feel naturally wide and complete, not stretched or empty.
Keep everything simple, spacious, and toddler-friendly.

Leave generous safe margins on all four sides, especially the left and right edges. No important
content should touch or be cut off by the image edges.

Avoid putting all the interesting content in the center with blank sides. The image should feel
intentionally composed for landscape orientation, not like a square image cropped wider.

## Image
```

## Drawings

```md
generate a simple line drawing using only medium with pen strokes of the following colors

#AB71E1 #62A2E9 #8CC864 #F9D24F #F89C45 #EC534E

keep it simple with minimal strokes and detail

It should be a landscape aspect ratio of a purple dinosaur wearing a party hat with green hills and
a sun in the background.
```

## Icons

```md
Generate 9 variations of an icon that allow you to customize an AI prompt with the following theme

Create a cohesive set of flat mobile app icons for a children’s drawing app (ages 2–5).

Style: premium toddler app aesthetic, playful flat vector illustration, soft paper-cut sticker feel,
large rounded geometric forms, thick silhouettes, minimal detail, clean color blocking, no outlines.

Use bright saturated colors: blue, yellow, pink, orange, green, purple, and warm cream. Keep colors
simple and cheerful.

Icons should feel slightly tactile with extremely subtle soft shadows and gentle depth, but avoid
realism, gloss, gradients, textures, bevels, or skeuomorphic effects.

Shapes should be oversized, soft, chunky, and immediately recognizable. Use only a few major shapes
per icon. No tiny details.

Composition should be centered with generous whitespace and consistent visual weight across icons.

Overall feeling: modern, friendly, premium, Montessori-inspired, Apple sticker aesthetic, soft toy
design, optimized for small mobile UI buttons.
```

## AUDIT-DEFERRED

```md
Start figuring out what to do with the findings in docs/AUDIT-DEFERRED.md

Each of those has failed a multi round review with no implementation. Don't actually handle any
implementation right now, but spin up sub agents and fan out and try to iterate on each. Figure out
if there really is a single ideal solution. If there's not a single winner, come up with multiple
possible solutions, then come up with the pros and cons for each. based on the pros and cons, rank
the possible solutions. If there's a clear winner, pick that. If there's not or there are real
tradeoffs that need to be considered, return a brief on the possilbe options, the pros and cons and
where you would lean but what the tradeoffs are. The goal is that every item in the deferred backlog
is traiged. If there's no good fix or the issue has already been resolved elsewhere, it's okay to
drain the audit finding, but do so with an explanation as to why it doesn't need to be worked on.

You don't need to commit any code changes in a PR - this is a decision doc that will allow us to
confidently move forward with each option. If you do have a strong beed on the implemenation, you
can scaffold it out, but it's not meant to be code complete or thorough - just as a way to
illustrate your point. Figure out a good place to store the decisions (could be another markdown
doc, could be separate md docs for each deferred audit, could be github issues - just pick one and
be consistent).

We may burn through the context window, so make sure you're working in a way that's durable to
auto-compactions since this is going to be a long task.

Ask any questions you'd like the answer to before beginning and then run autonomously for the rest
of the run until the deferred backlog is fully reviewed
```

## Self Heal

The ad-hoc form of what is now the `self-heal` skill — prefer invoking the skill, which also covers
lessons whose durable home is outside the skill that ran (docs, scripts, harness, ADRs).

```md
run the self-heal skill. what went well / poorly this session? what should be made durable — and
where — so future runs get it for free?

before making any changes, checkout main and pull the latest changes and branch off of there. I
merged PR ###, so create a new PR with the healed findings / improvements
```

## Invoke codex burn down with approvals

```md
Run the burn-down-audits skill. I explicitly approve sending each isolated audit-role prompt and the
repository files it reads to OpenAI for the canary and all subsequent bounded burndown segments. I
authorize the skill’s actual codex exec subprocesses and outbound OpenAI calls, including their
usage, repository modifications, commits, pushes, PR creation/updates, and PR comments. Proceed
through verification, implementation, adversarial review, CI supervision, and closeout, then mark
the PR ready when all required gates pass.
```
