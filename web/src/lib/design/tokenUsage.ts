import type { ThemeTokens } from './tokens';
import type { brand, scale } from './tokens';

// One "reach for it when…" rule per token, rendered beside each specimen on
// /design (ADR-0097). Lives apart from tokens.ts so the styleguide is the only
// bundle that pays for the strings; the Record types force a rule for every
// token, so a new token cannot ship undocumented.

export const brandUsage: Record<keyof typeof brand, string> = {
  brand:
    'The identity hue: hairlines, focus rings, accent-color, tints, and textless fills. Never under text — it is only 3.4:1 against --on-brand.',
  brandRgb:
    'Channel triplet for composing brand-tinted rgba()/rgb() values where a var() color cannot be used directly.',
  onBrand: 'The ink on any brand fill — pair it with --brand-solid, never with --brand.',
};

export const scaleUsage: Record<keyof typeof scale, string> = {
  space1: 'Hairline gaps: icon-to-label, stacked fine print.',
  space2: 'Gaps inside a control: chip rows, button icon gaps.',
  space3: 'Control padding and gaps between siblings in a group.',
  space4: 'Card padding and gaps between distinct controls.',
  space5: 'Roomy control padding (large tap targets).',
  space6: 'Page gutters and modal padding.',
  space7: 'Breaks between sections.',
  space8: 'Breaks between page-level parts.',

  radiusSm: 'Inline chips: code, kbd, small tags.',
  radiusMd: 'Controls: buttons, inputs, segmented pickers.',
  radiusLg: 'Cards and grouped panels.',
  radiusXl: 'Sheet-scale surfaces: page sheets, banners, hero cards.',
  radiusPill: 'Fully-round pills and toggle tracks.',

  borderWidth: 'The one hairline width; color comes from a themed border token.',

  fontSizeXs: 'Fine print: token values, timestamps, badge counts.',
  fontSizeSm: 'UI chrome: buttons, labels, rows, nav — the workhorse.',
  fontSizeMd: 'Body prose on parent pages and modals.',
  fontSizeLg: 'Ledes and section headings.',
  fontSizeXl: 'Modal and card titles.',
  fontSize2xl: 'Page-level H1s.',
  inputFontSize:
    'Every text input — floors the size at 16px so iOS Safari never zoom-strands the canvas (ADR-0076).',
  fontFamily: 'The app-wide sans stack; reference it, never restate it.',
  fontMono: 'Raw code and version strings: masked keys, inline code.',

  fontWeightMedium: 'Quiet labels: settings rows, list leads.',
  fontWeightSemibold: 'Buttons, active states, sub-heads.',
  fontWeightBold: 'Headings. Body prose stays at the untokenized 400 default.',

  durationFast: 'Presses, hovers, color flips.',
  durationBase: 'Standard transitions: fills, borders, reveals.',
  durationSlow: 'Whole-surface entrances: dialogs, panels.',
  easePop: 'Anything that pops in or celebrates: dialog fly-ins, download-done, the swatch ring.',
  easeGlide: 'Anything that settles or leaves: the polaroid, the clear ripple.',

  shadowControl:
    'The tight lift on a small raised control: the modal close disc, a selected segment thumb.',
  shadowPop: 'The deep overlay lift under whole modal cards.',

  clearGradientRest:
    'Only the Clear Button at rest and its coachmark ghost — unthemed so the tutorial cannot drift from the control.',
};

export const themeUsage: Record<keyof ThemeTokens, string> = {
  appBg: 'The ground behind parent-page content (never the drawing paper).',
  surface: 'Modal cards, the palette bar — the default card fill.',
  surface2: 'Inset panels and setting cards sitting on --surface.',
  surfaceHover: 'Hover fill for quiet controls on a surface.',
  surfaceWarmHover: 'Hover fill for paper-toned chrome (modal close disc, Install Banner).',
  border: 'The default hairline on surfaces.',
  borderWarm: 'Hairline on paper-toned chrome.',
  borderWarmStrong: 'The hovered/emphasized step of --border-warm.',
  controlTrack: 'A toggle switch in the off state.',
  controlTrackHover: 'The hovered off-state toggle.',
  sliderTrack: 'Slider rails and segmented-picker tracks.',
  sliderNotch: 'The snap-detent tick over a slider track.',
  textStrong: 'Headings and emphasized copy.',
  text: 'Body copy — the default ink.',
  textSoft: 'De-emphasized copy: help text, metadata, separators. Holds 4.5:1 even at small sizes.',
  iconInk: 'Monochrome icon fill on themed surfaces.',
  iconMuted: 'Quiet chrome icons at rest.',
  iconMutedHover: 'Quiet chrome icons on hover.',
  brandWash: 'Brand-tinted selected/active fills that keep dark ink.',
  brandWashHover: 'The hovered step of --brand-wash.',
  brandText: 'Brand-colored ink on plain surfaces: links, active labels.',
  brandSolid:
    'The brand fill that carries text (4.5:1 against --on-brand) — primary actions, selected chips.',
  brandSolidHover: 'The hovered step of --brand-solid; also the hover of a textless --brand fill.',
  successWash: 'Success banner and confirmation fills.',
  successText: 'Ink on --success-wash.',
  successAccent: 'The brighter confirmation check/icon green.',
  dangerWash: 'Destructive-action fills and error banners.',
  dangerText: 'Ink on --danger-wash.',
  paper: 'The drawing paper under the grain texture; JS reads it via PAPER_COLORS.',
  paperMargin: 'The flat tone behind the rotation-locked sheet.',
  holeStroke: 'The dashed outline of the eraser-size hole previews.',
  lineartFilter: 'Coloring-page line art inversion — dark mode turns lines to chalk.',
  lineartBlend: 'The blend mode pairing --lineart-filter.',
  floatSurface: 'Cards floating over the paper: action buttons, flyouts.',
  floatSurfaceHover: 'The hovered step of --float-surface.',
  floatBorder: 'The hairline edge that keeps float cards visible on dark paper.',
  floatShadow: 'The themed lift under paper-floating cards and page sheets.',
  floatShadowFlyout: 'The stronger themed lift under open flyouts.',
  darkInkKeyline: 'The keyline ringing near-black ink on float cards; inert in light mode.',
};
