// Style options for AI image generation. The client renders the style picker
// in the order these keys are defined, and the server appends the matching
// suffix to the base prompt. "Magical" is the lead style: a light sprinkle of
// enchantment over the base prompt so the plain option still feels like magic.
import type { ResolvedTheme } from '../theme';

export const STYLE_SUFFIXES = {
  Magical:
    'Add a gentle storybook enchantment: a few soft golden sparkles drifting through the air, a subtle warm glow around the main characters, and dreamy, inviting light across the scene.',
  Crayon:
    'Render the final image as a vibrant crayon drawing on lightly textured paper with playful wax strokes. Cover the entire sheet with wax: every area, the sky and ground included, is crayoned in solid color running right off all four edges, leaving no bare paper margin, border, or matte anywhere in the frame.',
  Watercolor:
    'Render the final image as a soft watercolor painting with gentle washes and bleeding edges. The painting fills the whole frame edge to edge, with the washes running off all four edges and no dry paper margin, border, or matte around them.',
  Paper:
    'Render the final image as a handmade layered paper-craft collage photographed from above: cut each element from thick, textured construction paper with soft rounded edges and lay it on a warm off-white textured-paper background, with soft natural drop shadows between the layers for a tactile, three-dimensional feel. Use no drawn outlines; the shapes are defined only by the paper color and the gentle shadows where the layers overlap. Fill the whole frame edge to edge, with no surrounding border or matte.',
  Felt: 'Render the final image as a handmade felt craft scene, with fuzzy 3D fabric textures and stitched details. The felt fills the whole frame edge to edge, running off all four edges, with no surrounding border, hoop, table, or backdrop visible.',
  Sticker:
    'Render the final image as a bold sticker illustration with thick outlines and solid colors, cut out with a WIDE white die-cut border — a thick, generous band of even white following the whole silhouette, like a chunky vinyl sticker. Place it on a chroma-key backdrop: a completely flat, uniform, saturated BRIGHT MAGENTA field (like a green-screen, but magenta) with no shadow, gradient, texture, vignette, or any other object anywhere on it. The backdrop must stay pure vivid magenta everywhere so it can be keyed away cleanly, and nothing in the sticker may be magenta. The whole sticker sits WELL INSIDE the frame, scaled to about three quarters of the image so a wide band of magenta shows on all four sides; no part of the sticker or its white border may touch, run off, or be cropped by any edge of the image.',
  Cartoon:
    'Render the final image as a clean digital cartoon and comic book illustration with bold lines, smooth shading, and crisp edges.',
  Clay: 'Render the final image as a handmade claymation scene: every element sculpted from soft modeling clay with rounded edges, gentle thumbprint texture, and a subtle sheen, lit like a stop-motion film set. Each sculpted piece is smooth, solid clay in one even color, with no drawn, scratched, or engraved lines on its surface. Fill the whole frame edge to edge with the clay scene, with no surrounding border, table, or backdrop visible.',
} satisfies Record<string, string>;

export type StyleName = keyof typeof STYLE_SUFFIXES;

export const STYLE_NAMES = Object.keys(STYLE_SUFFIXES) as StyleName[];

// Dark-theme replacements for the styles whose MEDIUM has to be described
// differently on dark paper, not just lit differently — the shared night clause
// in prompt.ts recolors a scene but cannot re-stage a craft. Crayon becomes wax
// on black construction paper, where the risk runs both ways: too literal a
// reading of "night" dims the drawing itself into mud, and pushing back too hard
// buys legibility at the cost of looking like daylight. Paper swaps its
// off-white sheet for charcoal and leans harder on fibrous cut edges, which the
// dark ground otherwise flattens away. Clay has to say the scene is one
// continuous mass, because the dark ground reads every silhouette as a dark
// outline and the forms flatten into stacked cutouts. Every other style takes
// its light suffix unchanged plus the night clause — Sticker included, now that
// its backdrop is cut away rather than colored.
export const DARK_STYLE_SUFFIXES = {
  Crayon:
    'Render the final image as a crayon drawing on dark construction paper, worked hard: each area layered and burnished until the wax is dense and slightly glossy, with visible scratchy highlights where a lighter crayon was dragged over a darker one and flecks of the dark sheet still showing through the tooth. Cover the entire sheet with wax — every area, the sky and ground included, is crayoned in solid color running right off all four edges, leaving no bare paper margin, border, or matte anywhere in the frame. Every shape is filled in solidly; never leave a shape as a hollow outline or a ring with the background showing through it. The scene is moonlit — a deep indigo night sky, dark green hills, a soft gold sun — with colors deep and luminous rather than pale, and plainly night rather than day.',
  Clay: 'Render the final image as a handmade claymation scene: every element sculpted from soft modeling clay with rounded edges, gentle thumbprint texture, and a subtle sheen, lit like a stop-motion film set under low, warm night lighting. The whole scene is ONE continuous mass of clay — the pieces are pressed together and blended into each other, with no dark outline, rim, seam, gap, or drop shadow between them, and nothing sitting on top as a separate flat cutout. Each form is a rounded three-dimensional volume, thickest through the middle and falling softly away at its silhouette, shaped by light and shade alone rather than by any edge drawn or darkened around it. Each sculpted piece is smooth, solid clay in one even color, with no drawn, scratched, or engraved lines on its surface. Fill the whole frame edge to edge with the clay scene, with no surrounding border, table, or backdrop visible.',
  Paper:
    'Render the final image as a handmade layered paper-craft collage. Cut every element from thick construction paper with soft rounded corners and visibly fibrous, slightly furry cut edges, and stack the elements in layers, each piece physically raised off the one beneath it and casting its own soft shadow so you can see it is a separate sheet with real thickness. The backmost layer is the night sky itself: one deep charcoal-indigo sheet of construction paper that IS the entire picture surface, filling the frame completely and running off all four edges. Light the scene from one side so the shadows and the paper grain stay clearly visible; a flat picture where the layers cannot be told apart is wrong. Every element must be unmistakably CUT PAPER — matte, fibrous, physically raised — never paint and never a flat drawing. Use no drawn outlines; the shapes are defined only by the paper color and the shadows where the layers overlap. There is no object sitting on a surface here: show no mount, card, tile, frame, border, matte, table, or backdrop, only the collage itself filling the entire image.',
} satisfies Partial<Record<StyleName, string>>;

/**
 * Styles generated on a flat field that the pipeline keys out, so the picker's
 * own surface shows through the cover instead of a baked plate. Their suffix
 * must describe that field as flat and unshadowed — see
 * tools/asset-gen/lib/flat-background-punch.mjs, which flood-fills it from the
 * border, and the drop shadow AiImagePrompt draws in CSS to replace the baked one.
 */
const PUNCHED_BACKGROUND_STYLES = ['Sticker'] as const satisfies readonly StyleName[];

export function hasPunchedBackground(style: StyleName): boolean {
  return (PUNCHED_BACKGROUND_STYLES as readonly StyleName[]).includes(style);
}

/** The suffix map for a theme — dark overrides layered over the light set. */
export function styleSuffixesFor(theme: ResolvedTheme): Record<StyleName, string> {
  return theme === 'dark' ? { ...STYLE_SUFFIXES, ...DARK_STYLE_SUFFIXES } : STYLE_SUFFIXES;
}

export function styleThumbPath(style: StyleName, theme: ResolvedTheme): string {
  return `/styles/${style.toLowerCase()}.${theme}.webp`;
}
