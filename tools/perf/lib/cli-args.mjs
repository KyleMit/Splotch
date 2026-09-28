import { DEVICES, resolveDevice } from './profile-devices.mjs';
import { TCP_PORT, fail, parseNumberFlag, parseOrFail, readValueFlag } from '../../lib/proc.mjs';
import { PORT_ROLES } from './capture-readiness.mjs';

// CDP's CPU throttling rate is a slowdown factor, so anything up to 1 runs
// unthrottled — replay's default of 0 included.
const THROTTLE_RATE = { min: 0 };

const describeThrottle = (rate) => {
  const active = rate > 1;
  return {
    rate,
    active,
    tag: active ? `${rate}x` : 'raw',
    forSettings: active ? rate : 0,
  };
};

const COMMON_FLAGS = ['device', 'port', 'no-build'];

function rejectUnknownFlags(argv, known) {
  const unknown = argv.filter((arg) => {
    const name = /^--([^=]+)/.exec(arg)?.[1];
    return name && !known.has(name);
  });
  if (unknown.length) {
    fail(`Unknown flag ${unknown.join(' ')} — known flags: ${[...known].sort().join(', ')}`);
  }
}

// `entry` is set by a real CLI invocation, where bad input is a one-line exit
// and an unknown flag is fatal. A library import leaves it unset: the perf entry
// modules parse at module scope but are also imported by the vitest script
// suites, where argv is vitest's own — so unknown flags pass, and a malformed
// value throws rather than exiting the importing test run.
export function parsePerfArgs(
  { throttleDefault, extra = [], entry = false } = {},
  argv = process.argv.slice(2)
) {
  const report = entry ? parseOrFail : (parse) => parse();
  const flag = (name, fallback) => report(() => readValueFlag(argv, name)) ?? fallback;
  const numberFlag = (name, fallback, rule) => {
    const raw = flag(name);
    return raw === undefined ? fallback : report(() => parseNumberFlag(name, raw, rule));
  };
  const has = (name) => argv.includes(`--${name}`);

  if (entry) {
    rejectUnknownFlags(
      argv,
      new Set([
        ...COMMON_FLAGS,
        ...(throttleDefault === undefined ? [] : ['throttle', 'no-throttle']),
        ...extra,
      ])
    );
  }

  const deviceName = flag('device', 'phone');
  const device = resolveDevice(deviceName);
  if (entry && !device) {
    fail(`Unknown --device=${deviceName} — known: ${Object.keys(DEVICES).join(', ')}`);
  }

  // Read even under --no-throttle, so a malformed rate is reported whichever wins.
  const requestedThrottle =
    throttleDefault === undefined
      ? undefined
      : numberFlag('throttle', throttleDefault, THROTTLE_RATE);

  return {
    flag,
    numberFlag,
    has,
    deviceName,
    device,
    throttle:
      requestedThrottle === undefined
        ? undefined
        : describeThrottle(has('no-throttle') ? 1 : requestedThrottle),
    port: numberFlag('port', PORT_ROLES.preview.port, TCP_PORT),
    build: !has('no-build'),
  };
}
