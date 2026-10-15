// The candidate import boundary excludes shipping web source; native-drawing-tokens.test.mjs pins this projection.
export const DRAWING_THEME = {
  surface: '#ffffff',
  surface2: '#f8f8f8',
  tapeStrength: '100%',
  tapeInk: '#333',
  squiggleStrength: '100%',
  surfaceHover: '#f5f5f5',
  border: '#e0e0e0',
  borderWarm: '#ddd6cc',
  borderWarmStrong: '#c4bbad',
  textStrong: '#333',
  text: '#474747',
  textSoft: '#666',
  brandWash: '#ede7f6',
  brandWashHover: '#ede1ff',
  brandSolid: '#7c50bb',
  brandText: '#7c50bb',
  dangerText: '#b04a4a',
  paper: '#fcfbf8',
  paperMargin: '#f1efeb',
  externalMarkWash: '#f1efeb',
  iconInk: '#1f1f1f',
  iconMuted: '#737373',
  successText: '#2e7d4f',
  successWash: '#e9f7ec',
  darkInkKeyline: 'transparent',
} as const;

export const DRAWING_ON_BRAND = '#fff';
export const DRAWING_BRAND = '#ab71e1';

// A photograph does not repaint at night, so the print and its ink are unthemed.
export const DRAWING_POLAROID = { paper: '#fdfcf7', ink: '#7c50bb' } as const;

export type PaperTheme = 'light' | 'dark';
export type DrawingTheme = { readonly [Key in keyof typeof DRAWING_THEME]: string };
export const DRAWING_THEMES: Record<PaperTheme, DrawingTheme> = {
  light: DRAWING_THEME,
  dark: {
    surface: '#23232b',
    surface2: '#2d2d37',
    tapeStrength: '45%',
    tapeInk: '#f4f1ea',
    squiggleStrength: '70%',
    surfaceHover: '#33333e',
    border: '#3d3d49',
    borderWarm: '#3d3d49',
    borderWarmStrong: '#4d4d5b',
    textStrong: '#eceaf2',
    text: '#d3d1dc',
    textSoft: '#bdbbc8',
    brandWash: '#3b2f4f',
    brandWashHover: '#46395c',
    brandSolid: '#8058c0',
    brandText: '#c9a9f0',
    dangerText: '#e09393',
    paper: '#211f29',
    paperMargin: '#1a1922',
    externalMarkWash: '#33333e',
    iconInk: '#dedce8',
    iconMuted: '#a8a6b3',
    successText: '#8bcfa4',
    successWash: '#24382b',
    darkInkKeyline: '#e9e7f0',
  },
};

// Paper colors project the design tokens across the candidate source boundary.
export const PAPER_THEMES = {
  light: { paper: DRAWING_THEME.paper, outline: DRAWING_THEME.textStrong },
  dark: { paper: DRAWING_THEMES.dark.paper, outline: DRAWING_THEMES.dark.textStrong },
} as const satisfies Record<PaperTheme, { paper: string; outline: string }>;

const scale = {
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  radiusSm: '8px',
  radiusMd: '12px',
  radiusLg: '16px',
  borderWidth: '1px',
  focusRingWidth: '2px',
  focusRingOffset: '2px',
  fontSizeSm: '14px',
  fontSizeMd: '16px',
  fontSizeXl: '22px',
  fontWeightSemibold: '600',
  fontWeightBold: '700',
  durationBase: '0.2s',
  scrimPill: 'rgb(23 23 29 / 72%)',
} as const;

// The released React Native Web color parser requires comma-separated rgba syntax.
export const DRAWING_SCRIM = scale.scrimPill.replace(
  /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/,
  (_, red: string, green: string, blue: string, alpha: string) =>
    `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
);
export const DRAWING_EASE_POP = [0.34, 1.56, 0.64, 1] as const;
export const TOUCH_TARGET = 52;
export const CONTROL_RADIUS = 14;
export const CONTROL_GAP = 8;

export const DRAWING_SCALE = {
  space1: Number.parseFloat(scale.space1),
  space2: Number.parseFloat(scale.space2),
  space3: Number.parseFloat(scale.space3),
  space4: Number.parseFloat(scale.space4),
  radiusSm: Number.parseFloat(scale.radiusSm),
  radiusMd: Number.parseFloat(scale.radiusMd),
  radiusLg: Number.parseFloat(scale.radiusLg),
  borderWidth: Number.parseFloat(scale.borderWidth),
  focusRingWidth: Number.parseFloat(scale.focusRingWidth),
  focusRingOffset: Number.parseFloat(scale.focusRingOffset),
  fontSizeSm: Number.parseFloat(scale.fontSizeSm),
  fontSizeMd: Number.parseFloat(scale.fontSizeMd),
  fontSizeXl: Number.parseFloat(scale.fontSizeXl),
  fontWeightSemibold: scale.fontWeightSemibold,
  fontWeightBold: scale.fontWeightBold,
  // Seconds, as the shipping token states it; Reanimated takes milliseconds.
  durationBase: Number.parseFloat(scale.durationBase),
};

// native-audio-projection.test.mjs pins these Settings metrics to the design scale.
export const SETTINGS_METRICS = {
  radius: 16,
  padding: 24,
  titleSize: 22,
  textSize: 16,
  gap: 8,
} as const;
