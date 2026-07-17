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
