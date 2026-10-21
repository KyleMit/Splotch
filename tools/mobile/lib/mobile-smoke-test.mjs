// The Maestro half of the native smoke tests, shared by the Android emulator
// and iOS simulator runners: both build + install the app their own way, then
// run this one flow. Each names the device it installed the app on, so the
// flow never runs on another attached device.
//
// The flow names the store identity, which the deploy workflows install. A
// local Android run installs the .dev build instead (run-smoke-test.mjs says
// why), so it runs a copy of the flow whose only change is that appId.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, sh } from '../../lib/proc.mjs';
import { STORE_APP_ID } from '../../release/lib/native-app.mjs';
import { maestroPath } from './maestro.mjs';

export const SMOKE_FLOW = '.maestro/smoke.yaml';

const appIdLine = (appId) => `appId: ${appId}`;

/** The flow text with its appId header line replaced; throws if the header is not the store's. */
export function flowForAppId(flow, appId) {
  const storeLine = new RegExp(`^${appIdLine(STORE_APP_ID).replaceAll('.', '\\.')}$`, 'm');
  if (!storeLine.test(flow))
    throw new Error(`${SMOKE_FLOW} does not open with ${appIdLine(STORE_APP_ID)}`);
  return flow.replace(storeLine, appIdLine(appId));
}

const maestroTest = (flowPath, device) =>
  sh(`"${maestroPath()}" ${device ? `--device ${device} ` : ''}test "${flowPath}"`);

export async function runMaestroSmoke({ device, appId = STORE_APP_ID } = {}) {
  if (appId === STORE_APP_ID) return maestroTest(SMOKE_FLOW, device);
  const dir = mkdtempSync(join(tmpdir(), 'splotch-smoke-'));
  try {
    const flowPath = join(dir, 'smoke.yaml');
    writeFileSync(flowPath, flowForAppId(readFileSync(join(ROOT, SMOKE_FLOW), 'utf8'), appId));
    return await maestroTest(flowPath, device);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
