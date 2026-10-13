import { lazySurface } from './lazySurface';

// Its segmented track slides on Reanimated, which nothing else in Settings loads on the web, and
// the web shows it only where a lock would be honored: a landscape phone in fullscreen.
export const RsdOrientationPicker = lazySurface(() =>
  import('./RsdOrientationPicker').then((module) => module.RsdOrientationPicker)
);
