import { lazySurface } from './lazySurface';

// Feedback uses this lazy surface. The problem confirmation loads the controls with its parent
// for initial checkbox focus; Expo places their shared content in startup.
export const DeviceCheckbox = lazySurface(() =>
  import('./RsdDeviceOptInContent').then((module) => module.DeviceCheckbox)
);
export const DeviceDetails = lazySurface(() =>
  import('./RsdDeviceOptInContent').then((module) => module.DeviceDetails)
);
