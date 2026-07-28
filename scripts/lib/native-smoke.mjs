// The Maestro half of the native smoke tests, shared by the Android emulator
// and iOS simulator runners: both build + install the app their own way, then
// run this one flow. Only the simulator runner needs to name a device.

import { sh } from './proc.mjs';
import { maestroPath } from './maestro.mjs';

export const SMOKE_FLOW = '.maestro/smoke.yaml';

export function runMaestroSmoke({ device } = {}) {
  const deviceFlag = device ? `--device ${device} ` : '';
  return sh(`"${maestroPath()}" ${deviceFlag}test ${SMOKE_FLOW}`);
}
