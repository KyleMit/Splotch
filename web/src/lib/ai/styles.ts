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
    'Render the final image as a bold sticker illustration with thick outlines, solid colors, and a white die-cut border, sitting on a plain white background with a soft drop shadow beneath it so it looks like a sticker peeling off the page.',
  Cartoon:
    'Render the final image as a clean digital cartoon and comic book illustration with bold lines, smooth shading, and crisp edges.',
  Clay: 'Render the final image as a handmade claymation scene: every element sculpted from soft modeling clay with rounded edges, gentle thumbprint texture, and a subtle sheen, lit like a stop-motion film set. Each sculpted piece is smooth, solid clay in one even color, with no drawn, scratched, or engraved lines on its surface. Fill the whole frame edge to edge with the clay scene, with no surrounding border, table, or backdrop visible.',
} satisfies Record<string, string>;

export type StyleName = keyof typeof STYLE_SUFFIXES;

export const STYLE_NAMES = Object.keys(STYLE_SUFFIXES) as StyleName[];

// Dark-theme replacements for the styles whose MEDIUM has to be described
// differently on dark paper, not just lit differently — the shared night clause
// in prompt.ts recolors a scene but cannot re-stage a craft. Crayon becomes wax
// on black construction paper so the strokes stay luminous instead of muddying;
// Paper swaps its off-white sheet for charcoal and leans harder on fibrous cut
// edges, which the dark ground otherwise flattens away; Sticker keeps its white
// die-cut band but needs a grey backing for the band to read at all. Every other
// style takes its light suffix unchanged plus the night clause.
export const DARK_STYLE_SUFFIXES = {
  Crayon:
    'Render the final image as a vibrant crayon drawing on dark construction paper, the way BRIGHT crayons look on a black sheet. Cover the entire sheet with wax — every area, the sky and ground included, is crayoned in solid color running right off all four edges, leaving no bare paper margin, border, or matte anywhere in the frame. Every shape is filled in solidly with wax; never leave a shape as a hollow outline or a ring with the background showing through it. The fill must be unmistakably WAX: matte, faintly grainy, with the tooth of the paper breaking through the color. Crucially, the crayons themselves are BRIGHT — vivid greens, a bold yellow sun, clear blues — laid down thickly enough to sit up light and cheerful against the dark sheet. Only the paper is dark; the drawing on it is not. A dim, muddy, or barely visible picture is wrong.',
  Paper:
    'Render the final image as a handmade layered paper-craft collage. Cut every element from thick construction paper with soft rounded corners and visibly fibrous, slightly furry cut edges, and stack the elements in layers, each piece physically raised off the one beneath it and casting its own soft shadow so you can see it is a separate sheet with real thickness. The backmost layer is the night sky itself: one deep charcoal-indigo sheet of construction paper that IS the entire picture surface, filling the frame completely and running off all four edges. Light the scene from one side so the shadows and the paper grain stay clearly visible; a flat picture where the layers cannot be told apart is wrong. Every element must be unmistakably CUT PAPER — matte, fibrous, physically raised — never paint and never a flat drawing. Use no drawn outlines; the shapes are defined only by the paper color and the shadows where the layers overlap. There is no object sitting on a surface here: show no mount, card, tile, frame, border, matte, table, or backdrop, only the collage itself filling the entire image.',
  Sticker:
    'Render the final image as a bold sticker illustration with thick outlines and solid colors, cut out with a clean white die-cut border that follows the artwork as one smooth, even band of constant width, sitting on a plain dark charcoal-grey background with a pronounced soft drop shadow beneath and around it, so the sticker lifts off the dark surface and its white edge reads as a crisp bright band against the grey.',
} satisfies Partial<Record<StyleName, string>>;

/** The suffix map for a theme — dark overrides layered over the light set. */
export function styleSuffixesFor(theme: ResolvedTheme): Record<StyleName, string> {
  return theme === 'dark' ? { ...STYLE_SUFFIXES, ...DARK_STYLE_SUFFIXES } : STYLE_SUFFIXES;
}

export function styleThumbPath(style: StyleName, theme: ResolvedTheme): string {
  return `/styles/${style.toLowerCase()}.${theme}.webp`;
}
