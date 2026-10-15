import type { PaperTheme } from '../drawing/theme';
import { BARE_GLASS_THEMES, GLASS_FROST } from './bareGlassTheme';

// The handmade-paper grain tile's mean coverage, and the mean color it lays down where it covers.
// rsd-native-glass-panes.test.mjs decodes web/src/lib/assets/handmade-paper.webp and holds both to
// it.
export const PAPER_GRAIN_COVERAGE = 0.1487;
export const PAPER_GRAIN_RGB = [154.05, 171.55, 174.9] as const;

const PERCENT = 100;

// A plain colour laid over the ink at `alpha` times the pane mask's coverage.
export type PaneInk = Readonly<{ rgb: readonly [number, number, number]; alpha: number }>;

// Shipping's pane (GlassPanes.svelte) prints the paper's grain over a glassStrip tint of the paper,
// and Android's WebView draws it unblurred. As one plain color: its alpha passes exactly as much of
// the ink below, and its color averages to the same paper, leaving out only the grain's fine
// variation.
function paneInk(theme: PaperTheme): PaneInk {
  const frost = parseFloat(GLASS_FROST.glassStrip) / PERCENT;
  const tint = BARE_GLASS_THEMES[theme].glassTintRgb.split(' ').map(Number);
  const alpha = 1 - (1 - frost) * (1 - PAPER_GRAIN_COVERAGE);
  const channel = (index: number) =>
    Math.round(
      (PAPER_GRAIN_COVERAGE * PAPER_GRAIN_RGB[index] +
        (1 - PAPER_GRAIN_COVERAGE) * frost * tint[index]) /
        alpha
    );
  return { rgb: [channel(0), channel(1), channel(2)], alpha };
}

export const GLASS_PANE_INKS = {
  light: paneInk('light'),
  dark: paneInk('dark'),
} as const satisfies Record<PaperTheme, PaneInk>;
