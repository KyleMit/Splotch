import { DEVICES, resolveDevice } from './profile-devices.mjs';
import {
  TCP_PORT,
  fail,
  parseNumberFlag,
  parseOrFail,
  readSwitch,
  readValueFlag,
  rejectUnknownFlags,
} from '../../lib/proc.mjs';
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

// Bad input, an unknown flag included, is a one-line exit. So a caller parses
// inside its exported run function, taking argv as a parameter, and never at
// module scope, where importing it would judge the importer's argv.
export function parsePerfArgs({ throttleDefault, extra = [] } = {}, argv = process.argv.slice(2)) {
  const flag = (name, fallback) => parseOrFail(() => readValueFlag(argv, name)) ?? fallback;
  const numberFlag = (name, fallback, rule) => {
    const raw = flag(name);
    return raw === undefined ? fallback : parseOrFail(() => parseNumberFlag(name, raw, rule));
  };
  const has = (name) => parseOrFail(() => readSwitch(argv, name));

  rejectUnknownFlags(
    [
      ...COMMON_FLAGS,
      ...(throttleDefault === undefined ? [] : ['throttle', 'no-throttle']),
      ...extra,
    ],
    argv
  );

  const deviceName = flag('device', 'phone');
  const device = resolveDevice(deviceName);
  if (!device) {
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
