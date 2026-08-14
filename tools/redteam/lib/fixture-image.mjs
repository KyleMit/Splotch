import sharp from 'sharp';
import { themes } from '../../../web/src/lib/design/tokens.ts';

// The red-team fixtures are hand-drawn PNGs with a transparent background, and a
// provider is free to composite that onto whatever it likes. OpenAI picks black,
// which turns a corpus of dark strokes into a set of near-black squares — and an
// entire 12-fixture run came back clean because the model was faithfully
// describing a black square. A safety suite that fails by reporting "all safe"
// is the worst failure shape there is, so this is not left to the provider.
//
// Flattening onto the app's light paper also makes the fixture match what
// /api/generate-image actually receives: the canvas export always paints an
// opaque paper fill beneath the strokes (web/src/lib/drawing/exportCompositor.ts),
// so production never sends transparency at all. See ADR-0023.
// Both papers the app actually draws on. Night is genuinely near-black, which is
// the same composite that broke this corpus — the difference is that a night
// drawing's strokes are chalk-light, so they survive it. The corpus is authored
// in light-theme colors, so light is the default and night is a deliberate
// second pass rather than something to mix in silently.
export const PAPERS = { light: themes.light.paper, night: themes.dark.paper };

const paperFor = (theme) => PAPERS[theme] ?? PAPERS.light;

/** The fixture as the app would have sent it: strokes over opaque paper. */
export function flattenOntoPaper(bytes, theme = 'light') {
  return sharp(bytes)
    .flatten({ background: paperFor(theme) })
    .png()
    .toBuffer();
}

/** Whether every pixel is fully opaque — what flattenOntoPaper must guarantee. */
export async function isFullyOpaque(bytes) {
  const image = sharp(bytes);
  const { hasAlpha } = await image.metadata();
  if (!hasAlpha) return true;
  const { channels } = await image.stats();
  const alpha = channels[3];
  return alpha !== undefined && alpha.min === 255;
}
