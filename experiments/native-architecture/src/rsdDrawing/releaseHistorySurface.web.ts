import { lazySurface } from './lazySurface';

// Settings and the hosted pages load release history through one chunk entry, so Metro keeps
// the shared notes out of the startup chunk. check-native-web-precache.mjs guards this boundary.
export const RsdReleaseHistory = lazySurface(() =>
  import('./RsdSettingsRoute').then((module) => module.RsdReleaseHistory)
);
export const RsdLatestReleaseLabel = lazySurface(() =>
  import('./RsdSettingsRoute').then((module) => module.RsdLatestReleaseLabel)
);
