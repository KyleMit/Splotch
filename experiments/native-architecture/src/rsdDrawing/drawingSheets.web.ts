import { lazySurface } from './lazySurface';

// Each surface the drawing screen shows only on request is its own chunk, fetched on first use
// (lazySurface.ts), so first paint carries the drawing screen alone.
export const AiWaitingPolaroid = lazySurface(() =>
  import('../ai/AiWaitingPolaroid').then((module) => module.AiWaitingPolaroid)
);
export const ColorPicker = lazySurface(() =>
  import('../drawing/ColorPicker').then((module) => module.ColorPicker)
);
export const NativeSoundSettingsDialog = lazySurface(() =>
  import('./RsdSettingsDialog').then((module) => module.NativeSoundSettingsDialog)
);
export const RsdAiSheet = lazySurface(() =>
  import('./RsdAiSheet').then((module) => module.RsdAiSheet)
);
export const RsdColoringBookPicker = lazySurface(() =>
  import('./RsdColoringBookPicker').then((module) => module.RsdColoringBookPicker)
);
export const RsdFeedbackSheet = lazySurface(() =>
  import('./RsdFeedbackSheet').then((module) => module.RsdFeedbackSheet)
);
export const RsdParentCenterSection = lazySurface(() =>
  import('./RsdParentCenterSection').then((module) => module.RsdParentCenterSection)
);
export const RsdParentGateSheet = lazySurface(() =>
  import('./RsdParentGateSheet').then((module) => module.RsdParentGateSheet)
);
