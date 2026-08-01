import { QUICKSAND_FONT_FAMILY } from '../fonts.ts';

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

const BRAND_HEX = '#ab71e1';
const BRAND_RGB = [
  Number.parseInt(BRAND_HEX.slice(1, 3), 16),
  Number.parseInt(BRAND_HEX.slice(3, 5), 16),
  Number.parseInt(BRAND_HEX.slice(5, 7), 16),
].join(', ');

// Brand accent used for active/hover chrome across parent + AI UI.
// Custom properties pierce Svelte's style scoping, so components reference
// these directly via var().
export const brand = {
  brand: BRAND_HEX,
  // Plain-RGBA brand-shadow fallbacks source their channels from --brand-rgb;
  // the following color-mix declaration remains the modern rendering path.
  brandRgb: BRAND_RGB,
  brandHover: '#9961d1',
  // Filter chain that renders a black icon in --brand. Filters can't reference
  // a color directly, so this hand-tuned chain re-encodes the brand color —
  // keep the two in sync if the brand color ever changes.
  brandTintFilter:
    'invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%)',
  // Text/icon ink on --brand fills. Lives here (unthemed) because --brand
  // itself is constant across themes, so what sits on it is too.
  onBrand: '#fff',
} as const;

// Theme-independent scales. These are the vocabulary for component styles —
// prefer them over literal px/shadow/easing values so spacing, corners, type,
// and motion stay on one ramp app-wide. It also holds the handful of unthemed
// *fills*: chrome color that reads the same on both papers, so it has no
// light/dark pair to live in ThemeTokens.
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

  borderWidth: '1px',

  // Named --font-size-*, not --text-*, so the type ramp can't collide with
  // the themed text-color family (--text, --text-strong, --text-muted, …).
  fontSizeXs: '12px',
  fontSizeSm: '13px',
  fontSizeMd: '14px',
  fontSizeLg: '16px',
  fontSizeXl: '18px',
  fontSize2xl: '22px',
  fontSize3xl: '28px',

  // Text-input font-size floor: iOS Safari / WKWebView zooms the visual
  // viewport when a focused input's font-size is < 16px, which on the
  // drawing route would strand the canvas zoomed with no way to reset it
  // (ADR-0076). Every parent-center text input must reference this.
  inputFontSize: 'max(16px, var(--font-size-md))',

  // The app-wide sans stack. Components reference var(--font-family) rather
  // than hand-copying it (ErrorScreen, AdminConsole) so there is one source of
  // truth for the family name.
  fontFamily: `'${QUICKSAND_FONT_FAMILY}', 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,

  // Raw code/version values (masked API keys, version strings, inline code).
  fontMono: "'Courier New', monospace",

  fontWeightSemibold: '600',

  durationFast: '0.15s',
  durationBase: '0.2s',
  durationSlow: '0.35s',
  // The overshoot pop shared by the fly-in dialogs; the settle glide the
  // polaroid uses; the harder overshoot for celebratory accents (download-done
  // pop, swatch ring, Clear Button) — deliberately springier than --ease-pop,
  // so don't converge the two without design review.
  easePop: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  easeGlide: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easePopStrong: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  // Neutral (unthemed) elevation. The paper-floating cards use the *themed*
  // --float-shadow tokens instead — these are for modal-layer chrome where
  // one shadow reads correctly on both themes.
  shadowSm: '0 2px 6px rgba(0, 0, 0, 0.12)',
  shadowPop: '0 8px 32px rgba(0, 0, 0, 0.3)',
  // The tight lift on the selected segment of a segmented toggle (theme,
  // orientation). Deliberately harder and closer than --shadow-sm so the
  // thumb reads as sitting just above its track — don't converge the two.
  shadowSegment: '0 1px 4px rgba(0, 0, 0, 0.18)',

  // The Clear Button's at-rest fill, mirrored by the drag-to-clear coachmark
  // ghost so the tutorial always matches the real control.
  clearGradientRest: 'linear-gradient(135deg, #ff6b6b, #ee5a6f)',
} as const;

// The cross-component stacking order, low to high. Scoped to "chrome" — the
// fixed/absolute-positioned UI that can visually collide with something outside
// its own component. Layers sealed inside a real stacking context (everything
// under DrawingCanvas's .canvas-stack, which sets isolation: isolate; the close
// buttons on the AI and coloring-book cards; the hovered palette hexagon) stay
// as local integers: tokenizing them would imply a global relationship they
// don't have.
//
// These are ONE ordered list but not one stacking context, so a bigger number
// does not always win. Every value except zFlyout resolves in the root context
// — notably .canvas-container is position: relative with no z-index, so it
// establishes nothing and its children compete directly with the fixed chrome.
// zFlyout is the exception (see its note). The tiers are a convention, not a
// containment guarantee.
export const zIndex = {
  // FullscreenToggle — the floor of that shared root context, not a separate
  // local scale. It clears DrawingCanvas's other root-level layers
  // (.paper-sheet 0, .canvas-stack 1, .paper-view 2, .brush-ring/.eraser-bubble
  // 3) and deliberately loses to every persistent control below.
  zCanvasChrome: 4,

  // Clear Button drag feedback: the paper wash previewing the clear, then the
  // confirmation ripple over it. Both are full-viewport, both sit above the
  // canvas and below every persistent control.
  zClearPreview: 400,
  zRipple: 500,

  zCornerButton: 900, // ParentHelpButton
  zPanel: 901, // ActionsPanel
  // app.css .flyout-menu (Brush Menu + Stroke Width Menu) — the one value here
  // that is NOT in the root context. .actions-panel is position: fixed with a
  // z-index, so it establishes its own, and this only orders the flyout inside
  // that subtree. Hence the tie with zPanel is inert; hence also raising this
  // past zBanner would change nothing, because zPanel caps the whole subtree.
  // Lifting a flyout over the banner means raising zPanel, not this.
  zFlyout: 901,
  zBanner: 950, // InstallBanner — takes over the corner controls while shown
  zClearAcceptZone: 999, // below the button it rings, so the button stays on top
  zClearButton: 1000,
  // Pre-existing tie with zClearButton: both are fixed, and which one paints on
  // top is DOM order today. Preserved deliberately — resolving it is a visual
  // change, not a rename.
  zNotch: 1000,
  zClearCoachmark: 1001, // the ghost button, above the real one
  zPalette: 1002,
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
  /**
   * The brand as a FILL that carries text. `--brand` itself is the identity
   * hue and only clears 3.4:1 against --on-brand, so a solid purple control
   * with a white label fails WCAG AA at body size; this is the darkened step
   * that clears 4.5:1 in both themes. Use it wherever brand-colored background
   * sits under words (the report kind picker, a page's primary call to
   * action); keep `--brand` for hairlines, focus rings, accent-color and tints,
   * where the 3:1 non-text floor applies instead.
   */
  brandSolid: string;
  /**
   * The hovered step of --brand-solid. Both themes darken rather than lighten:
   * a brighter purple cannot hold 4.5:1 against the white label it carries.
   */
  brandSolidHover: string;
  /** verification / feedback banners */
  successWash: string;
  successText: string;
  /**
   * Confirmation check/icon green (download-done, setup check) — brighter
   * than --success-text. Minted same-value in both themes from the recurring
   * raw #4caf50; a dark-tuned value would be a visible change needing review.
   */
  successAccent: string;
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
    brandSolid: '#7c50bb',
    brandSolidHover: '#6b3fbf',
    successWash: '#e9f7ec',
    successText: '#2e7d4f',
    successAccent: '#4caf50',
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
    brandSolid: '#8058c0',
    brandSolidHover: '#6f47b0',
    successWash: '#24382b',
    successText: '#8bcfa4',
    successAccent: '#4caf50',
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

// `appBg` → `--app-bg`, `surface2` → `--surface-2`, `fontSize2xl` → `--font-size-2xl`.
export function toCssVarName(key: string): string {
  return `--${key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`;
}
