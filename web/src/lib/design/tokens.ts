// Design-token single source of truth (ADR-0071).
//
// Every value here is emitted into web/src/tokens.css by `npm run gen:tokens`
// (scripts/gen-tokens.mjs) — camelCase keys become kebab-case custom
// properties (`appBg` → `--app-bg`). Components consume the CSS variables;
// the few JS consumers that can't read CSS (canvas export fill, Notch Band,
// theme-color meta) import the typed objects below, so there is no
// hand-synced mirror to drift.
//
// The `ThemeTokens` interface is what keeps light and dark structurally
// identical — the compiler now enforces what app.css previously demanded via
// a "these blocks MUST stay identical" comment.

// Brand accent used for active/hover chrome across parent + AI UI.
// Custom properties pierce Svelte's style scoping, so components reference
// these directly via var().
export const brand = {
  brand: '#ab71e1',
  brandHover: '#9961d1',
  // Filter chain that renders a black icon in --brand. Filters can't reference
  // a color directly, so this hand-tuned chain re-encodes #ab71e1 — keep the
  // two in sync if the brand color ever changes. Brand-tinted shadows are
  // derived instead via color-mix(in srgb, var(--brand) N%, transparent),
  // each preceded by a plain-rgba fallback declaration for pre-color-mix
  // engines (see docs/COMPATIBILITY.md).
  brandTintFilter:
    'invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%)',
} as const;

// Theme-independent scales. These are the vocabulary for component styles —
// prefer them over literal px/shadow/easing values so spacing, corners, type,
// and motion stay on one ramp app-wide.
export const scale = {
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '20px',
  space6: '24px',
  space7: '32px',
  space8: '40px',

  radiusXs: '4px',
  radiusSm: '8px',
  radiusMd: '12px',
  radiusLg: '16px',
  radiusXl: '22px',
  radiusPill: '999px',

  textXs: '12px',
  textSm: '13px',
  textMd: '14px',
  textLg: '16px',
  textXl: '18px',
  text2xl: '22px',
  text3xl: '28px',

  durationFast: '0.15s',
  durationBase: '0.2s',
  durationSlow: '0.35s',
  // The overshoot pop shared by the fly-in dialogs; the settle glide the
  // polaroid uses.
  easePop: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  easeGlide: 'cubic-bezier(0.22, 1, 0.36, 1)',

  // Neutral (unthemed) elevation. The paper-floating cards use the *themed*
  // --float-shadow tokens instead — these are for modal-layer chrome where
  // one shadow reads correctly on both themes.
  shadowSm: '0 2px 6px rgba(0, 0, 0, 0.12)',
  shadowPop: '0 8px 32px rgba(0, 0, 0, 0.3)',
} as const;

// Themed tokens. Dark mode swaps these — and only these — so themed chrome
// must reference colors through them. The one deliberately unthemed control
// is the Clear Button — its red danger chrome reads the same on light or
// dark paper.
export interface ThemeTokens {
  appBg: string;
  /** modal cards, palette bar */
  surface: string;
  /** setting cards, inset panels */
  surface2: string;
  surfaceHover: string;
  /** beige hover on paper-toned buttons */
  surfaceWarmHover: string;
  border: string;
  borderWarm: string;
  borderWarmStrong: string;
  /** toggle-switch off state */
  controlTrack: string;
  controlTrackHover: string;
  sliderTrack: string;
  /** snap-detent tick over track + fill */
  sliderNotch: string;
  textStrong: string;
  text: string;
  textMid: string;
  textMuted: string;
  textFaint: string;
  /** monochrome icon fill (matches the SVGs' baked fill) */
  iconInk: string;
  iconMuted: string;
  iconMutedHover: string;
  /** brand-tinted active/selected fills */
  brandWash: string;
  /** one step stronger, for hovering washed elements */
  brandWashHover: string;
  brandText: string;
  /** verification / feedback banners */
  successWash: string;
  successText: string;
  dangerWash: string;
  dangerText: string;
  /**
   * The drawing paper. The handmade-paper texture webp is a LOW-ALPHA grain
   * layer, so one texture serves both themes — only the color beneath it
   * changes. JS consumers (canvas export fill, Notch Band eraser color) read
   * this via PAPER_COLORS in lib/theme.ts, which derives from these objects.
   */
  paper: string;
  /** the flat tone behind the rotation-locked sheet */
  paperMargin: string;
  /**
   * Dashed outline of the eraser-size "hole" previews (ActionsPanel flyout +
   * trigger icon) — neutral gray so the holes never read as ink. Their fill
   * is --paper, so the holes literally show the canvas through the flyout.
   */
  holeStroke: string;
  /**
   * Coloring-page line art: black lines multiplied over light paper; dark
   * mode inverts them to white "chalk" lines and screens them over the dark
   * paper (ADR-0052, direction B). The overlay only renders while a page is
   * applied, so these effectively drive the dark+coloring treatment.
   */
  lineartFilter: string;
  lineartBlend: string;
  /**
   * Cards floating over the paper (action buttons, stroke flyout). In dark
   * mode a step lighter than --paper so they still read as raised cards.
   */
  floatSurface: string;
  floatSurfaceHover: string;
  /**
   * Hairline edge + lift for the float cards. In light mode the edge is
   * transparent (the warm drop shadow does the separating); in dark mode a
   * faint light hairline plus a real drop shadow give the cards a visible
   * edge against the dark paper, where the warm shadow vanishes.
   */
  floatBorder: string;
  floatShadow: string;
  floatShadowFlyout: string;
  /**
   * Keyline ringing near-black currentColor ink on the float cards — the
   * dark twin of the white-ink black keyline (ActionsPanel .white-stroke).
   * Inert in light mode, where dark ink already reads on the light cards.
   */
  darkInkKeyline: string;
}

export const themes: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    appBg: '#f5f5f5',
    surface: '#ffffff',
    surface2: '#f8f8f8',
    surfaceHover: '#f5f5f5',
    surfaceWarmHover: '#f4f0ea',
    border: '#e0e0e0',
    borderWarm: '#ddd6cc',
    borderWarmStrong: '#c4bbad',
    controlTrack: '#ddd',
    controlTrackHover: '#ccc',
    sliderTrack: '#e9e9e9',
    sliderNotch: 'rgba(0, 0, 0, 0.22)',
    textStrong: '#333',
    text: '#555',
    textMid: '#666',
    textMuted: '#888',
    textFaint: '#999',
    iconInk: '#1f1f1f',
    iconMuted: '#737373',
    iconMutedHover: '#404040',
    brandWash: '#ede7f6',
    brandWashHover: '#e3d7f5',
    brandText: '#7c50bb',
    successWash: '#e9f7ec',
    successText: '#2e7d4f',
    dangerWash: '#fdecec',
    dangerText: '#b04a4a',
    paper: '#fcfbf8',
    paperMargin: '#f1efeb',
    holeStroke: '#8a8a93',
    lineartFilter: 'none',
    lineartBlend: 'multiply',
    floatSurface: '#ffffff',
    floatSurfaceHover: '#f5f5f5',
    floatBorder: 'transparent',
    floatShadow: '0 2px 6px rgba(93, 84, 68, 0.14), 0 6px 16px rgba(93, 84, 68, 0.1)',
    floatShadowFlyout: '0 6px 20px rgba(93, 84, 68, 0.2)',
    darkInkKeyline: 'transparent',
  },
  dark: {
    appBg: '#17171d',
    surface: '#23232b',
    surface2: '#2d2d37',
    surfaceHover: '#33333e',
    surfaceWarmHover: '#33333e',
    border: '#3d3d49',
    borderWarm: '#3d3d49',
    borderWarmStrong: '#4d4d5b',
    controlTrack: '#4a4a57',
    controlTrackHover: '#575765',
    sliderTrack: '#3a3a45',
    sliderNotch: 'rgba(255, 255, 255, 0.4)',
    textStrong: '#eceaf2',
    text: '#c9c7d3',
    textMid: '#b3b1bf',
    textMuted: '#918f9c',
    textFaint: '#85838f',
    iconInk: '#dedce8',
    iconMuted: '#a8a6b3',
    iconMutedHover: '#e8e6f0',
    brandWash: '#3b2f4f',
    brandWashHover: '#46395c',
    brandText: '#c9a9f0',
    successWash: '#24382b',
    successText: '#8bcfa4',
    dangerWash: '#422a2c',
    dangerText: '#e09393',
    paper: '#211f29',
    paperMargin: '#1a1922',
    holeStroke: '#b9b9c2',
    lineartFilter: 'invert(1)',
    lineartBlend: 'screen',
    floatSurface: '#2e2c38',
    floatSurfaceHover: '#393744',
    floatBorder: 'rgba(255, 255, 255, 0.1)',
    floatShadow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 3px 10px rgba(0, 0, 0, 0.5)',
    floatShadowFlyout: '0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 22px rgba(0, 0, 0, 0.6)',
    darkInkKeyline: '#e9e7f0',
  },
};

// `appBg` → `--app-bg`, `surface2` → `--surface-2`, `text2xl` → `--text-2xl`.
export function toCssVarName(key: string): string {
  return `--${key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`;
}
