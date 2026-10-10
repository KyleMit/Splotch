// The candidate import boundary excludes shipping web source; native-drawing-tokens.test.mjs pins this projection.
export const DRAWING_THEME = {
  surface: '#ffffff',
  borderWarm: '#ddd6cc',
  textStrong: '#333',
  text: '#474747',
  textSoft: '#666',
  brandWash: '#ede7f6',
  brandSolid: '#7c50bb',
  paper: '#fcfbf8',
  paperMargin: '#f1efeb',
} as const;

const scale = {
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  radiusMd: '12px',
  radiusLg: '16px',
  fontSizeSm: '14px',
  fontSizeMd: '16px',
  fontSizeXl: '22px',
  fontWeightSemibold: '600',
  fontWeightBold: '700',
  scrimPill: 'rgb(23 23 29 / 72%)',
} as const;

// The released React Native Web color parser requires comma-separated rgba syntax.
export const DRAWING_SCRIM = scale.scrimPill.replace(
  /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/,
  (_, red: string, green: string, blue: string, alpha: string) =>
    `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
);
export const TOUCH_TARGET = 52;
export const CONTROL_RADIUS = 14;
export const CONTROL_GAP = 8;

export const DRAWING_SCALE = {
  space1: Number.parseFloat(scale.space1),
  space2: Number.parseFloat(scale.space2),
  space3: Number.parseFloat(scale.space3),
  space4: Number.parseFloat(scale.space4),
  radiusMd: Number.parseFloat(scale.radiusMd),
  radiusLg: Number.parseFloat(scale.radiusLg),
  fontSizeSm: Number.parseFloat(scale.fontSizeSm),
  fontSizeMd: Number.parseFloat(scale.fontSizeMd),
  fontSizeXl: Number.parseFloat(scale.fontSizeXl),
  fontWeightSemibold: scale.fontWeightSemibold,
  fontWeightBold: scale.fontWeightBold,
};

// native-audio-projection.test.mjs pins these Settings metrics to the design scale.
export const SETTINGS_METRICS = {
  radius: 16,
  padding: 24,
  titleSize: 22,
  textSize: 16,
  gap: 8,
} as const;
