import type { PaperTheme } from '../drawing/theme';
import { BARE_GLASS_THEMES, GLASS_FROST } from './bareGlassTheme';
import type { PaneInk } from './glassPaneTiles';

// The handmade-paper grain tile's mean coverage, and the mean color it lays down where it covers.
// rsd-native-glass-panes.test.mjs decodes web/src/lib/assets/handmade-paper.webp and holds both to
// it.
export const PAPER_GRAIN_COVERAGE = 0.1487;
export const PAPER_GRAIN_RGB = [154.05, 171.55, 174.9] as const;

const PERCENT = 100;

// Shipping's pane (GlassPanes.svelte) prints the paper's grain over a glassStrip tint of the paper,
// and Android's WebView draws it unblurred. As one plain color: its alpha passes exactly as much of
// the ink below, and its color averages to the same paper, leaving out only the grain's fine
// variation.
function paneInk(theme: PaperTheme): PaneInk {
  const frost = parseFloat(GLASS_FROST.glassStrip) / PERCENT;
  const tint = BARE_GLASS_THEMES[theme].glassTintRgb.split(' ').map(Number);
  const alpha = 1 - (1 - frost) * (1 - PAPER_GRAIN_COVERAGE);
  const rgb = tint.map(
    (channel, index) =>
      (PAPER_GRAIN_COVERAGE * PAPER_GRAIN_RGB[index] +
        (1 - PAPER_GRAIN_COVERAGE) * frost * channel) /
      alpha
  );
  return { rgb: rgb.map(Math.round).join(' '), alpha: +alpha.toFixed(3) };
}

export const GLASS_PANE_INKS = {
  light: paneInk('light'),
  dark: paneInk('dark'),
} as const satisfies Record<PaperTheme, PaneInk>;
