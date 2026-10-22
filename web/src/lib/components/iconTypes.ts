import type { IconName } from './icon-names';

// The authoritative list of icons that are *not* renderable through <Icon>:
// they're consumed structurally instead (splotchy via SplotchyIcon.svelte).
// Vite resolves `import.meta.glob` statically, so the exclusion globs in
// Icon.svelte and its two guard tests can't be built from this constant — they
// repeat the pattern literally and point back here. Adding an entry means
// updating this list, all three glob literals (icon-orphans.test.ts checks each
// of them against this constant and fails on a mismatch), *and*
// SectionIcon.svelte's dispatch, which routes each excluded name to its
// structural component instead of <Icon>.
export const NON_RENDERABLE_ICONS = ['splotchy'] as const;

export type CommonIconName = Exclude<IconName, (typeof NON_RENDERABLE_ICONS)[number]>;

export function iconNameFromPath(path: string): IconName {
  return (path.split('/').pop() ?? '').replace(/\.svg$/, '') as IconName;
}

export const COLOR_ICONS = new Set<CommonIconName>([
  'appearance',
  'ink-splotch',
  'brush-crayon',
  'brush-eraser',
  'brush-magic',
  'brush-pen',
  'camera',
  'controls',
  'dottie-another-idea',
  'dottie-bright',
  'dottie-giggle',
  'dottie-hiccup',
  'dottie-kind-eyes',
  'dottie-lean',
  'dottie-question',
  'dottie-retry',
  'dottie-stumped',
  'dottie-sunny',
  'feedback',
  // The stroke glyph inherits its caller's ink instead of the modal fill override.
  'refresh',
  'line-weight-brush',
  'line-weight-eraser',
  'line-weight-magic',
  'more-colors',
  'parent-center',
  'release-fixed',
  'release-improved',
  'release-new',
  'save-picture',
  'setup',
  'shapes',
  'sound',
  'trash-closed',
  'trash-open',
  'undo',
  'wand-stars',
  'whats-new',
  // Stroke-size previews carry their own coloring — the brush sizes via
  // currentColor (the active ink color), the eraser sizes and its
  // line-weight-eraser trigger via theme vars (--paper / --hole-stroke) —
  // so they must skip the monochrome tint filter too.
  'size-brush-1',
  'size-brush-2',
  'size-brush-3',
  'size-brush-4',
  'size-brush-5',
  'size-eraser-1',
  'size-eraser-2',
  'size-eraser-3',
  'size-eraser-4',
  'size-eraser-5',
  'size-magic-1',
  'size-magic-2',
  'size-magic-3',
  'size-magic-4',
  'size-magic-5',
]);
