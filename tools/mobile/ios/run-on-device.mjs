// Builds, installs, and launches the app on the connected physical iPad or
// iPhone through `cap run ios`, resolving the hardware UDID dynamically
// (issue #1645 removed the committed hardware pin). IOS_UDID, when set, wins;
// otherwise exactly one physical device must be attached. Used by
// ios:run:device (macOS-only; needs signing + a trusted developer cert — see
// the mobile guide).

import { execFileSync } from 'node:child_process';
import { fail, isMain, run } from '../../lib/proc.mjs';

// Hardware UDIDs are 8-hyphen-16 hex (capture-readiness.mjs); the host Mac and
// simulators list UUID-shaped identifiers that do not match.
const HARDWARE_UDID_IN_PARENS = /\(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16})\)/g;

export function resolvePhysicalIosUdid({ xctraceOutput, envUdid }) {
  if (envUdid) return envUdid;
  const devicesSection = xctraceOutput.split(/^== .*Simulators.*==$/m)[0];
  const udids = [...devicesSection.matchAll(HARDWARE_UDID_IN_PARENS)].map((match) => match[1]);
  if (udids.length === 1) return udids[0];
  if (udids.length === 0)
    throw new Error('[run-on-device] no physical iOS device attached (xcrun xctrace list devices)');
  throw new Error(
    `[run-on-device] ${udids.length} physical iOS devices attached — set IOS_UDID to pick one`
  );
}

if (isMain(import.meta.url)) {
  let udid;
  try {
    udid = resolvePhysicalIosUdid({
      xctraceOutput: execFileSync('xcrun', ['xctrace', 'list', 'devices']).toString('utf8'),
      envUdid: process.env.IOS_UDID,
    });
  } catch (error) {
    fail(error.message);
  }
  run('cap', ['run', 'ios', '--target', udid]);
}
