// Style options for AI image generation. The client renders the radio picker
// in the order these keys are defined, and the server appends the matching
// suffix to the base prompt. "Default" applies no extra styling so kids can
// see the plain magical illustration without picking a particular style.
export const STYLE_SUFFIXES: Record<string, string> = {
  Default: '',
  Crayon:
    'Render the final image as a vibrant crayon drawing on lightly textured paper with playful wax strokes.',
  Watercolor:
    'Render the final image as a soft watercolor painting with gentle washes and bleeding edges.',
  Paper:
    'Render the final image as a 3D pop-up storybook page and layered paper cutout collage with depth shadows and textured edges.',
  Felt: 'Render the final image as a handmade felt craft scene, with fuzzy 3D fabric textures and stitched details.',
  Sticker:
    'Render the final image as a bold sticker illustration with thick outlines, solid colors, and cutout white borders.',
  Cartoon:
    'Render the final image as a clean digital cartoon and comic book illustration with bold lines, smooth shading, and crisp edges.',
  Pixel:
    'Render the final image as a cute retro pixel art scene with simplified shapes, crisp blocks, and a vibrant, limited palette.',
  // Glow: 'Render the final image with soft glowing edges and magical neon accents in a whimsical, kid-safe fantasy style.',
  // Clay: 'Render the final image as a claymation scene with sculpted clay characters on a tabletop set.',
};

export const STYLE_NAMES = Object.keys(STYLE_SUFFIXES);
