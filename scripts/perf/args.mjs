import { resolveDevice } from './devices.mjs';

export const resolveThrottle = (args, defaultRate) => {
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

// Tolerant lookup (never throws) and an `entry`-gated warn-only unknown-flag
// report: the perf entry modules parse at module scope but are also imported as
// libraries by the vitest script suites, where argv is vitest's own.
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
  return {
    flag,
    has,
    deviceName,
    device: resolveDevice(deviceName),
    throttle: throttleDefault === undefined ? undefined : resolveThrottle(argv, throttleDefault),
    port: Number(flag('port', '4173')),
    build: !has('no-build'),
  };
}
