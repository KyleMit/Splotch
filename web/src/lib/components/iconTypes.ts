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
