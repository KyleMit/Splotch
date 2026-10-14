import { DRAWING_THEMES, type PaperTheme } from '../drawing/theme';
import { BARE_GLASS_THEMES, type RuleBlend } from './bareGlassTheme';

type Rgb = readonly [number, number, number];

const CHANNEL_MAX = 255;
const HEX_COLOR = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;

function channels(hex: string): Rgb {
  const match = HEX_COLOR.exec(hex);
  if (!match) throw new Error(`Expected a #rrggbb color, got ${hex}`);
  const [, r, g, b] = match;
  const value = (pair: string) => parseInt(pair, 16) / CHANNEL_MAX;
  return [value(r), value(g), value(b)];
}

// One rule's ink: a plain color laid over the paper at `alpha` times the gradient's coverage.
type RuleInk = Readonly<{ rgb: string; alpha: number }>;

// The color C and strength s for which paper + s·k·(C − paper) is the blend at coverage k:
// multiply darkens by k·(1 − ink), screen lightens by k·ink·(1 − paper). s is the least that
// keeps C a color, so ink under a rule shows through as much as a plain layer allows.
function preblend(blend: RuleBlend, paper: Rgb, ink: Rgb) {
  if (blend === 'multiply') {
    const strength = 1 - Math.min(...ink);
    return {
      strength,
      color: paper.map((p, c) => (strength ? p * (1 - (1 - ink[c]) / strength) : p)),
    };
  }
  const strength = Math.max(...ink);
  return {
    strength,
    color: paper.map((p, c) => (strength ? p + (ink[c] * (1 - p)) / strength : p)),
  };
}

function ruleInks(theme: PaperTheme): Readonly<{ first: RuleInk; second: RuleInk }> {
  const glass = BARE_GLASS_THEMES[theme];
  const { strength, color } = preblend(
    glass.ruleBlend,
    channels(DRAWING_THEMES[theme].paper),
    channels(glass.ruleInk)
  );
  const rgb = color.map((value) => Math.round(value * CHANNEL_MAX)).join(' ');
  return {
    first: { rgb, alpha: glass.ruleOpacity * strength },
    second: { rgb, alpha: glass.ruleSecondaryOpacity * strength },
  };
}

// The margin rules' blend, worked out against the paper ahead of time. A blended view makes
// Android draw its whole parent, the drawing layout with its ink, offscreen on every frame.
export const MARGIN_RULE_INKS = {
  light: ruleInks('light'),
  dark: ruleInks('dark'),
} as const satisfies Record<PaperTheme, unknown>;
