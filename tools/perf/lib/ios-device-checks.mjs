import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, argFlag, hasCommand } from '../../lib/proc.mjs';
import { iosIdentifierProblem } from './capture-readiness.mjs';
import {
  DEVICECTL_LIST_ARGS,
  emptyUsbListDetail,
  parseDevicectlListing,
} from './ios-attachment.mjs';
import { iosDeveloperModeCheck } from './ios-developer-mode.mjs';
import { checkIosProvisioning } from './ios-provisioning.mjs';

const IOS_DETAILS_TIMEOUT_SECONDS = 8;

const sh = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    out: (result.stdout ?? '').trim(),
    err: result.error ? result.error.message : (result.stderr ?? '').trim(),
  };
};

export function iosChecks() {
  const checks = [];
  if (!hasCommand('idevice_id')) {
    checks.push({
      name: 'ios tooling',
      status: 'blocked',
      detail: 'idevice_id is missing — brew install libimobiledevice',
    });
    return { checks, udid: null, udids: null };
  }
  const udids = sh('idevice_id', ['-l']).out.split('\n').filter(Boolean);
  if (udids.length === 0) {
    checks.push({
      name: 'ios device',
      status: 'blocked',
      detail: emptyUsbListDetail(
        parseDevicectlListing(sh('xcrun', DEVICECTL_LIST_ARGS).out),
        argFlag('ios-udid', null)
      ),
    });
    return { checks, udid: null, udids };
  }
  const udid = argFlag('ios-udid', udids[0]);
  const problem = iosIdentifierProblem(udid);
  checks.push({
    name: 'ios device',
    status: problem ? 'blocked' : 'ok',
    detail: problem ?? `${udid} (hardware UDID — not the devicectl CoreDevice UUID)`,
  });

  const developerMode = iosDeveloperModeCheck(
    sh('xcrun', [
      'devicectl',
      'device',
      'info',
      'details',
      '--device',
      udid,
      '--json-output',
      '-',
      '--timeout',
      String(IOS_DETAILS_TIMEOUT_SECONDS),
    ])
  );
  checks.push(developerMode);

  const provisioning = checkIosProvisioning(udid);
  if (provisioning) checks.push(provisioning);

  // The tunnel is root-owned and its password prompt cannot be answered
  // unattended, so a running one is reused rather than restarted.
  const tunnel = sh('pgrep', ['-fl', 'tunnel-creation.mjs']).out;
  const tunnelForDevice = tunnel.includes(udid);
  checks.push({
    name: 'ios remotexpc tunnel',
    status: tunnelForDevice ? 'ok' : 'blocked',
    detail: tunnelForDevice
      ? 'already running for this device — reused, no approval needed'
      : 'not running. Start it once, then leave it up:\n' +
        `      osascript -e 'do shell script "$(which node) ~/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs --udid ${udid} --disconnect-retry-max-attempts 3 > /tmp/ios-tunnel.log 2>&1" with administrator privileges'`,
  });

  checks.push({
    name: 'ios signing config',
    status: existsSync(join(ROOT, 'ios', 'local.xcconfig')) ? 'ok' : 'blocked',
    detail: 'ios/local.xcconfig',
  });

  return {
    checks,
    udid,
    udids,
    developerModeEnabled: developerMode.enabled,
    provisioningReady: provisioning?.status !== 'blocked',
  };
}
