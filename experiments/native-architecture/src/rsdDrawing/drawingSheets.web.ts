import { lazy } from 'react';

// Each surface the drawing screen shows only on request is its own chunk, fetched on first use, so
// first paint carries the drawing screen alone; the service worker precaches every chunk, so a
// sheet still opens offline. A component suspends while its chunk loads, under the Suspense
// boundary that renders it.
export const AiWaitingPolaroid = lazy(() =>
  import('../ai/AiWaitingPolaroid').then((module) => ({ default: module.AiWaitingPolaroid }))
);
export const ColorPicker = lazy(() =>
  import('../drawing/ColorPicker').then((module) => ({ default: module.ColorPicker }))
);
export const NativeSoundSettingsDialog = lazy(() =>
  import('./RsdSettingsDialog').then((module) => ({ default: module.NativeSoundSettingsDialog }))
);
export const RsdAiSheet = lazy(() =>
  import('./RsdAiSheet').then((module) => ({ default: module.RsdAiSheet }))
);
export const RsdColoringBookPicker = lazy(() =>
  import('./RsdColoringBookPicker').then((module) => ({ default: module.RsdColoringBookPicker }))
);
export const RsdFeedbackSheet = lazy(() =>
  import('./RsdFeedbackSheet').then((module) => ({ default: module.RsdFeedbackSheet }))
);
export const RsdParentCenterSection = lazy(() =>
  import('./RsdParentCenterSection').then((module) => ({
    default: module.RsdParentCenterSection,
  }))
);
export const RsdParentGateSheet = lazy(() =>
  import('./RsdParentGateSheet').then((module) => ({ default: module.RsdParentGateSheet }))
);
