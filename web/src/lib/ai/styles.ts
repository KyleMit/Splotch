// Style options for AI image generation. The client renders the radio picker
// in the order these keys are defined, and the server appends the matching
// suffix to the base prompt. "Magical" is the lead style: a light sprinkle of
// enchantment over the base prompt so the plain option still feels like magic.
export const STYLE_SUFFIXES: Record<string, string> = {
  Magical:
    'Add a gentle storybook enchantment: a few soft golden sparkles drifting through the air, a subtle warm glow around the main characters, and dreamy, inviting light across the scene.',
  Crayon:
    'Render the final image as a vibrant crayon drawing on lightly textured paper with playful wax strokes.',
  Watercolor:
    'Render the final image as a soft watercolor painting with gentle washes and bleeding edges.',
  Paper:
    'Render the final image as a handmade layered paper-craft collage photographed from above: cut each element from thick, textured construction paper with soft rounded edges and lay it on a warm off-white textured-paper background, with soft natural drop shadows between the layers for a tactile, three-dimensional feel. Use no drawn outlines; the shapes are defined only by the paper color and the gentle shadows where the layers overlap. Fill the whole frame edge to edge, with no surrounding border or matte.',
  Felt: 'Render the final image as a handmade felt craft scene, with fuzzy 3D fabric textures and stitched details.',
  Sticker:
    'Render the final image as a bold sticker illustration with thick outlines, solid colors, and a white die-cut border, sitting on a plain white background with a soft drop shadow beneath it so it looks like a sticker peeling off the page.',
  Cartoon:
    'Render the final image as a clean digital cartoon and comic book illustration with bold lines, smooth shading, and crisp edges.',
  Clay: 'Render the final image as a handmade claymation scene: every element sculpted from soft modeling clay with rounded edges, gentle thumbprint texture, and a subtle sheen, lit like a stop-motion film set. Each sculpted piece is smooth, solid clay in one even color, with no drawn, scratched, or engraved lines on its surface. Fill the whole frame edge to edge with the clay scene, with no surrounding border, table, or backdrop visible.',
};

export const STYLE_NAMES = Object.keys(STYLE_SUFFIXES);
