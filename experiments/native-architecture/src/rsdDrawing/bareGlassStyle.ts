// BareToolbarPaper.svelte and GlassPanes.svelte, the flat style's glass and printed margin: the
// values their style blocks write as literals. rsd-native-bare-toolbar.test.mjs reads both
// components and fails on divergence.
export const RAIL_GLASS_BLUR_PX = 4.6;
export const STRIP_GLASS_BLUR_PX = 5.1;
export const MARGIN_RULE_WIDTH_PX = 3;
// The second rule sits this far past the first, its fiber shifted so the two never match.
export const MARGIN_RULE_GAP_PX = 5;
export const MARGIN_RULE_INK_STOPS = [30, 70] as const;
export const MARGIN_RULE_FIBER_PX = 600;
export const MARGIN_RULE_SECOND_OFFSET_PX = 137;
export const FULLSCREEN_GLASS_PX = 114;

// Inlined, as shipping inlines them: fetched by URL, the fiber would arrive after the toolbar paints.
export const MARGIN_RULE_FIBER = {
  landscape: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='600'%3E%3Cfilter id='a'%3E%3CfeTurbulence baseFrequency='0.6 0.035' numOctaves='3' seed='7' type='fractalNoise'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E")`,
  portrait: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='8'%3E%3Cfilter id='a'%3E%3CfeTurbulence baseFrequency='0.035 0.6' numOctaves='3' seed='7' type='fractalNoise'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E")`,
} as const;
export const FULLSCREEN_GLASS_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='114' height='114'%3E%3Cfilter id='f' x='-50%25' y='-50%25' width='200%25' height='200%25'%3E%3CfeGaussianBlur stdDeviation='10'/%3E%3C/filter%3E%3Crect x='-44' y='-44' width='114' height='114' rx='18' filter='url(%23f)'/%3E%3C/svg%3E")`;
