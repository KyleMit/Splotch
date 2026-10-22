import type { PaperTheme } from '../drawing/theme';

// The design tokens the flat style's glass and margin rules read (src/lib/design/tokens.ts),
// which tokens.css.ts leaves unprojected. Kept here rather than imported, so the glass chunk does
// not share the whole token module with the other lazy chunks, which would hoist it onto the
// startup path; rsd-native-bare-toolbar.test.mjs holds every value to tokens.ts.
export const GLASS_FROST = { glassRail: '77%', glassStrip: '85%' } as const;

export type RuleBlend = 'multiply' | 'screen';

export const BARE_GLASS_THEMES = {
  light: {
    glassTintRgb: '252 251 248',
    ruleInk: '#e4a0ab',
    ruleBlend: 'multiply',
    ruleOpacity: 1,
    ruleSecondaryOpacity: 0.6,
  },
  dark: {
    glassTintRgb: '33 31 41',
    ruleInk: '#b07683',
    ruleBlend: 'screen',
    ruleOpacity: 0.55,
    ruleSecondaryOpacity: 0.33,
  },
} as const satisfies Record<
  PaperTheme,
  {
    glassTintRgb: string;
    ruleInk: string;
    ruleBlend: RuleBlend;
    ruleOpacity: number;
    ruleSecondaryOpacity: number;
  }
>;
