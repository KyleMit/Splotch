import type { CommonIconName } from './components/iconTypes';

type ReleaseSection = 'New' | 'Improved' | 'Fixed';

export const RELEASE_SECTION_ICONS = {
  New: 'release-new',
  Improved: 'release-improved',
  Fixed: 'release-fixed',
} as const satisfies Record<ReleaseSection, CommonIconName>;
