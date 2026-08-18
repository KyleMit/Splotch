import type { ThemeTokens } from './tokens';
import type { brand, scale, zIndex } from './tokens';

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
  radiusLg:
    'Everything bigger than a control: cards, grouped panels, modal cards, banners, page sheets.',
  radiusPill: 'Fully-round pills and toggle tracks.',

  borderWidth: 'The one hairline width; color comes from a themed border token.',

  fontSizeXs: 'Fine print: token values, timestamps, badge counts.',
  fontSizeSm: 'UI chrome: buttons, labels, rows, nav — the workhorse.',
  fontSizeMd: 'Body prose on parent pages and modals.',
  fontSizeLg: 'Ledes and section headings.',
  fontSizeXl:
    'Titles — the ceiling inside any surface: modal titles, card titles, section H2s. Nothing between this and the display tier.',
  fontSizeDisplay:
    'The H1 of a whole page — PageShell’s hero, the crash screen — fluid from phone to desktop.',
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

  polaroidPaper:
    'The print white every polaroid in the app is made of — pinned on both themes, because a photograph does not repaint at night.',
  polaroidInk: 'Brand ink written on --polaroid-paper, pinned to the paper it sits on.',
};

export const zIndexUsage: Record<keyof typeof zIndex, string> = {
  zCanvasChrome: 'The floor of the shared root context — chrome that must clear the canvas layers.',
  zClearPreview: 'The full-viewport paper wash previewing a drag-to-clear.',
  zRipple: 'The clear-confirmation ripple, over the preview wash.',
  zCornerButton: 'The muted corner buttons (Settings Button).',
  zPanel: 'The Actions Panel drawer — caps its own subtree, including the flyouts.',
  zFlyout:
    'Orders the flyout inside .actions-panel only; the root-context tie with --z-panel is inert.',
  zBanner: 'The Install Banner, taking over the corner controls while shown.',
  zClearAcceptZone: 'The drag-accept ring, below the button it rings.',
  zClearButton: 'The Clear Button itself.',
  zNotch: 'The safe-area Notch Band; its tie with --z-clear-button resolves by DOM order.',
  zClearCoachmark: 'The tutorial ghost button, above the real one.',
  zPalette: 'The Color Palette bar.',
  zWaitingPolaroid:
    'The AI Waiting Polaroid — the only way back into a minimized run, over the palette edge it is pinned beside.',
  zPolaroid: 'The save-screenshot polaroid flight — the top of the chrome order.',
};

export const themeUsage: Record<keyof ThemeTokens, string> = {
  appBg: 'The ground behind parent-page content (never the drawing paper).',
  surface: 'Modal cards, the palette bar — the default card fill.',
  surface2: 'Inset panels and setting cards sitting on --surface.',
  surfaceHover:
    'The one hover fill for quiet controls — paper-toned chrome (modal close disc, Install Banner) included.',
  border: 'The default hairline on surfaces.',
  borderWarm: 'Hairline on paper-toned chrome.',
  borderWarmStrong: 'The hovered/emphasized step of --border-warm.',
  controlTrack:
    "Every inactive picker/track ground: toggle-off state, slider rails, the segment track and a borderless chip's unselected fill. Pinned to hold 4.5:1 under --text-soft labels.",
  controlTrackHover: 'The hovered step of --control-track.',
  sliderNotch: 'The snap-detent tick over a slider track.',
  textStrong: 'Headings and emphasized copy.',
  text: 'Body copy — the default ink.',
  textSoft:
    'De-emphasized copy: help text, metadata, separators, input placeholders. Holds 4.5:1 even at small sizes.',
  iconInk:
    'Monochrome icon fill on themed surfaces — and the hover state of --icon-muted: quiet icons hover to full ink.',
  iconMuted:
    'Quiet chrome icons at rest, and the scrollbar thumb over its transparent track. Holds the 3:1 non-text minimum on every scroller ground.',
  brandWash: 'Brand-tinted selected/active fills that keep dark ink.',
  brandWashHover: 'The hovered step of --brand-wash.',
  brandText: 'Brand-colored ink on plain surfaces: links, active labels.',
  brandSolid:
    'The brand fill that carries text (4.5:1 against --on-brand) — primary actions, selected chips.',
  brandSolidHover: 'The hovered step of --brand-solid; also the hover of a textless --brand fill.',
  successWash: 'Success banner and confirmation fills.',
  successText: 'The one success green: ink on --success-wash and confirmation checks/icons alike.',
  dangerWash: 'Destructive-action fills and error banners.',
  dangerText: 'Ink on --danger-wash.',
  paper: 'The drawing paper under the grain texture; JS reads it via PAPER_COLORS.',
  paperMargin: 'The flat tone behind the rotation-locked sheet.',
  holeStroke: 'The dashed outline of the size-eraser hole previews.',
  lineartFilter: 'Coloring-page line art inversion — dark mode turns lines to chalk.',
  lineartBlend: 'The blend mode pairing --lineart-filter.',
  floatSurface: 'Cards floating over the paper: action buttons, flyouts.',
  floatSurfaceHover: 'The hovered step of --float-surface.',
  floatBorder: 'The hairline edge that keeps float cards visible on dark paper.',
  floatShadow:
    'The one themed lift for everything floating on the paper — cards, open flyouts, page sheets.',
  darkInkKeyline: 'The keyline ringing near-black ink on float cards; inert in light mode.',
};
