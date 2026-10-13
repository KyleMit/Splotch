import { lazySurface } from './lazySurface';

// Each surface the drawing screen shows only on request is its own chunk, fetched on first use
// (lazySurface.ts), so first paint carries the drawing screen alone. The AI and feedback
// surfaces share their owners' chunk (productChunk.web.ts).
export const AiWaitingPolaroid = lazySurface(() =>
  import('../product/productChunk.web').then((module) => module.AiWaitingPolaroid)
);
export const RsdSettingsRoute = lazySurface(() =>
  import('./RsdSettingsRoute').then((module) => module.RsdSettingsRoute)
);
export const RsdAiSheet = lazySurface(() =>
  import('../product/productChunk.web').then((module) => module.RsdAiSheet)
);
export const RsdColorPicker = lazySurface(() =>
  import('./RsdColorPicker').then((module) => module.RsdColorPicker)
);
export const RsdColoringBookPicker = lazySurface(() =>
  import('./RsdColoringBookPicker').then((module) => module.RsdColoringBookPicker)
);
export const RsdErrorScreen = lazySurface(() =>
  import('./RsdErrorScreen').then((module) => module.RsdErrorScreen)
);
export const RsdFailureBanner = lazySurface(() =>
  import('./RsdFailureBanner').then((module) => module.RsdFailureBanner)
);
export const RsdFeedbackSheet = lazySurface(() =>
  import('../product/productChunk.web').then((module) => module.RsdFeedbackSheet)
);
export const RsdParentGateSheet = lazySurface(() =>
  import('./RsdParentGateSheet').then((module) => module.RsdParentGateSheet)
);
