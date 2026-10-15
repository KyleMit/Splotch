import { lazySurface } from './lazySurface';

// Sharing these controls between lazy report forms otherwise puts their styles in startup.
export const DeviceCheckbox = lazySurface(() =>
  import('./RsdDeviceOptInContent').then((module) => module.DeviceCheckbox)
);
export const DeviceDetails = lazySurface(() =>
  import('./RsdDeviceOptInContent').then((module) => module.DeviceDetails)
);
