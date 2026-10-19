// WEB-1 (RN web platform behavior) cells for Chromium. Each cell runs the same public steps on
// `rn-web` and `web-prod` and returns what each arm showed, stored, and fetched.
import { boot, capture, driverCardinality, onBothArms } from './harness.mjs';

export const RECORD = 'web-1-observations.json';

export const CELLS = {
  // #2921: the stroke driver is admitted per arm and input before any drawing or Undo cell.
  'driver-mouse': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const result = await driverCardinality(s);
      return { ...result, ...(await capture(s, `driver-mouse-${s.arm}`)) };
    }),
  'driver-touch': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      const result = await driverCardinality(s);
      return { ...result, ...(await capture(s, `driver-touch-${s.arm}`)) };
    }),
};
