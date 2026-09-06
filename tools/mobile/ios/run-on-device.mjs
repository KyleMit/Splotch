// Builds, installs, and launches the app on the connected physical iPad or
// iPhone through `cap run ios`, resolving the hardware UDID dynamically
// (issue #1645 removed the committed hardware pin). IOS_UDID, when set, wins;
// otherwise exactly one physical device must be attached. Used by
// ios:run:device (macOS-only; needs signing + a trusted developer cert — see
// the mobile guide).

import { execFileSync } from 'node:child_process';
import { fail, isMain, run } from '../../lib/proc.mjs';
import { isPhysicalAppleUdid } from '../../perf/ios/capture-xcuitest-actions.mjs';

// Each device line ends with its identifier in parens. isPhysicalAppleUdid
// owns which shapes are physical hardware (modern 8-16 hex and legacy 40-hex);
// the host Mac and simulators list 8-4-4-4-12 UUIDs it rejects.
const PARENTHESIZED_IDENTIFIER = /\(([0-9A-Fa-f-]+)\)/g;

export function resolvePhysicalIosUdid({ xctraceOutput, envUdid }) {
  if (envUdid) return envUdid;
  const devicesSection = xctraceOutput.split(/^== .*Simulators.*==$/m)[0];
  const udids = [...devicesSection.matchAll(PARENTHESIZED_IDENTIFIER)]
    .map((match) => match[1])
    .filter(isPhysicalAppleUdid);
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
