// The styleguide's sections in reading order, each under its part. The sidebar, the contents list
// and the scrollspy all read this one list.
export const DESIGN_PARTS = {
  foundations: { label: 'Foundations', intro: 'The vocabulary every style is built from.' },
  primitives: {
    label: 'Primitives',
    intro: 'Reusable controls and content patterns, with their supported variants and states.',
  },
  components: {
    label: 'Components & chrome',
    intro: 'Settings rows and the named surfaces the app builds from the primitives.',
  },
  brand: {
    label: 'Brand & voice',
    intro: 'How Splotch sounds and signs its name: the copy rules and the brand marks.',
  },
} as const;
export type DesignPart = keyof typeof DESIGN_PARTS;

export const DESIGN_SECTIONS = [
  { id: 'color', label: 'Color', part: 'foundations' },
  { id: 'palette', label: 'Crayon palette', part: 'foundations' },
  { id: 'paper', label: 'Paper', part: 'foundations' },
  { id: 'type', label: 'Type scale', part: 'foundations' },
  { id: 'space', label: 'Spacing & radius', part: 'foundations' },
  { id: 'elevation', label: 'Elevation', part: 'foundations' },
  { id: 'motion', label: 'Motion', part: 'foundations' },
  { id: 'icons', label: 'Icons', part: 'foundations' },
  { id: 'recipes', label: 'Recipes', part: 'foundations' },
  { id: 'dialog-header', label: 'Dialog header', part: 'primitives' },
  { id: 'button', label: 'Button', part: 'primitives' },
  { id: 'segmented-picker', label: 'Segmented picker', part: 'primitives' },
  { id: 'status-message', label: 'Status message', part: 'primitives' },
  { id: 'rule-label', label: 'Rule label', part: 'primitives' },
  { id: 'disclosure', label: 'Disclosure', part: 'primitives' },
  { id: 'scroll-cue', label: 'Scroll cue', part: 'primitives' },
  { id: 'visually-hidden', label: 'Visually hidden', part: 'primitives' },
  { id: 'external-mark', label: 'External mark', part: 'primitives' },
  { id: 'furniture', label: 'Settings furniture', part: 'components' },
  { id: 'named', label: 'Named chrome', part: 'components' },
  { id: 'voice', label: 'Voice & copy', part: 'brand' },
  { id: 'mascot', label: 'Mascot & wordmark', part: 'brand' },
  { id: 'dottie', label: 'Dottie', part: 'brand' },
] as const satisfies readonly { id: string; label: string; part: DesignPart }[];
export type DesignSectionId = (typeof DESIGN_SECTIONS)[number]['id'];

export const DESIGN_COPY = {
  documentTitle: 'Splotch design system',
  title: 'Splotch design system',
  lede: "The visual language, rendered live from the app's own tokens and components. If it's not on this page, it's not part of the visual language.",
  sources:
    'Sources: `rsdDrawing/tokens.css.ts` (projected from `web/src/lib/design/tokens.ts` by `gen-rsd-drawing-tokens.mjs`) · `drawing/palette.ts` · the icon set · the shipped React Native components',
  defaultsTitle: 'Not sure? Start here',
  defaults:
    "Most styling decisions should never reach the tables below. A card is `colors.surface` with a `colors.border` hairline, `dimensions.radiusLg` corners, and `dimensions.space4` padding. UI chrome is `dimensions.fontSizeSm`, prose is `dimensions.fontSizeMd`, both in `colors.text`; headings are `colors.textStrong` in `fonts.bold`; a title is `dimensions.fontSizeXl` unless it heads a whole page. The primary action is `RsdButton`'s `brand` variant. Transitions run `motion.durationBase`; anything that pops in takes `motion.easePop`. Reach past a default only when its rule below says so. Text and glyphs are never dimmed with opacity; change their color token instead.",
  footer:
    "Rendered live from tokens.css.ts · palette.ts · the icon set. If it's not here, it's not part of the language.",
  backToTop: 'Back to top',
  contents: 'Contents',
} as const;
