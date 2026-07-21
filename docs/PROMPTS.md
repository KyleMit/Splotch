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

## Drawings

```md
generate a simple line drawing using only medium with pen strokes of the following colors

#AB71E1 #62A2E9 #8CC864 #F9D24F #F89C45 #EC534E

keep it simple with minimal strokes and detail

It should be a landscape aspect ratio of a purple dinosaur wearing a party hat with green hills and
a sun in the background.
```

## Stroke-type tool icons (pen, crayon)

For the pen/crayon brush-type buttons (siblings of the eraser and magic-brush buttons in the Actions
Panel). The app tints the icon's barrel to the active drawing color at runtime — the same
`fill="currentColor"` mechanism as `line-weight.svg` — so the colorable region must stay one flat
solid color the winner can be vectorized from. Attach the existing-icons reference sheet
(`artifacts/icon-candidates/pen-crayon/` renders it live) and run the prompt twice: once as PEN,
once as CRAYON. A hand-drawn SVG first pass (also tinted via currentColor) lives on that same
artifact page.

```md
The attached image shows the current tool icons from a toddler drawing app: a paintbrush drawing
squiggles, a pink eraser, and a rainbow magic brush. Generate 9 variations of a {PEN | CRAYON} icon
that belongs to this same family, laid out in a 3x3 grid on a plain white background.

Style: premium toddler app aesthetic, playful flat vector illustration, soft paper-cut sticker feel,
large rounded geometric forms, thick silhouettes, minimal detail, clean color blocking, no outlines,
no gradients, no gloss, no texture, no drop shadows.

Composition: one {pen | crayon} per tile, drawn at a 45-degree angle with the tip pointing to the
bottom-left (as if actively drawing), centered with generous margins, chunky enough to stay readable
at 60px.

RECOLOR CONSTRAINT (important): the app recolors the {pen's barrel and tip | crayon's body and tip}
to whatever color the child has selected, so paint that entire region in ONE perfectly flat solid
color — use purple #AB71E1 as the placeholder — with no shading, highlights, or gradients on it. The
fixed accents (the {cap band and grip collar | paper wrapper}) must use warm cream #ECDCBF with tan
#C9B891 details, matching the eraser's cream body.

Vary across the 9 tiles: {chunky felt-tip marker, rounded sign pen, fountain-style nib, cap-on vs
cap-off | classic wrapped crayon, stubby toddler crayon, taller slim crayon, worn rounded tip vs
sharp cone tip}, some with and some without a drawn squiggle stroke trailing from the tip (the
squiggle, if present, is also flat placeholder purple).
```

Lessons encoded above: the flat single-color barrel is what makes runtime tinting possible — a
shaded/gradient barrel can't be recolored cleanly, so reject variations that shade it. Keep the
cream accents fixed so the icon still reads as an object (not a color blob) for every palette color,
including white-on-dark.

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
