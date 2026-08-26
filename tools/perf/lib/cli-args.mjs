import { DEVICES, resolveDevice } from './profile-devices.mjs';
import { fail } from '../../lib/proc.mjs';
import { PORT_ROLES } from './capture-readiness.mjs';

// `entry`-gated numeric parsing: an unparsable flag is fatal for a real CLI
// invocation, but a library import (vitest's own argv) must not exit — mirrors
// the `--device` fail() below.
export function requireNumberFlag(name, raw, entry) {
  const n = Number(raw);
  if (entry && Number.isNaN(n)) {
    fail(`--${name} must be a number, got "${raw}"`);
  }
  return n;
}

const resolveThrottle = (args, defaultRate) => {
  const hit = args.find((arg) => arg.startsWith('--throttle='));
  const rate = args.includes('--no-throttle') ? 1 : Number(hit ? hit.split('=')[1] : defaultRate);
  const active = rate > 1;

  return {
    rate,
    active,
    tag: active ? `${rate}x` : 'raw',
    forSettings: active ? rate : 0,
  };
};

const COMMON_FLAGS = ['device', 'port', 'no-build'];

// Tolerant lookup and `entry`-gated input reports (warn-only for unknown flags,
// fatal for an unknown device): the perf entry modules parse at module scope but
// are also imported as libraries by the vitest script suites, where argv is
// vitest's own.
export function parsePerfArgs(
  { throttleDefault, extra = [], entry = false } = {},
  argv = process.argv.slice(2)
) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : fallback;
  };
  const has = (name) => argv.includes(`--${name}`);

  if (entry) {
    const known = new Set([
      ...COMMON_FLAGS,
      ...(throttleDefault === undefined ? [] : ['throttle', 'no-throttle']),
      ...extra,
    ]);
    for (const arg of argv) {
      const name = /^--([^=]+)/.exec(arg)?.[1];
      if (name && !known.has(name)) {
        console.warn(`Unknown flag ${arg} — known flags: ${[...known].sort().join(', ')}`);
      }
    }
  }

  const deviceName = flag('device', 'phone');
  const device = resolveDevice(deviceName);
  if (entry && !device) {
    fail(`Unknown --device=${deviceName} — known: ${Object.keys(DEVICES).join(', ')}`);
  }

  const throttle =
    throttleDefault === undefined ? undefined : resolveThrottle(argv, throttleDefault);
  if (entry && throttle && Number.isNaN(throttle.rate)) {
    fail(`--throttle must be a number, got "${flag('throttle', String(throttleDefault))}"`);
  }

  return {
    flag,
    has,
    deviceName,
    device,
    throttle,
    port: requireNumberFlag('port', flag('port', String(PORT_ROLES.preview.port)), entry),
    build: !has('no-build'),
  };
}
