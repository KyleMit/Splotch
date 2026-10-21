import { readFileSync, writeFileSync } from 'node:fs';
import { adb, guard } from './android-driver.mjs';

const LOCAL = '/private/tmp/rn-hunt-path.jsonl';
const REMOTE = '/data/local/tmp/rn-hunt-path.jsonl';
const SAMPLE_MS = 16;
const STEPS = 60;
const registration = JSON.parse(
  readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
);
export function controlledPath(from, to) {
  const commands = [registration, { id: 1, command: 'delay', duration: 1500 }];
  const emit = (events) =>
    commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
  emit([
    3,
    47,
    0,
    3,
    57,
    11,
    3,
    55,
    0,
    3,
    53,
    from[0],
    3,
    54,
    from[1],
    3,
    48,
    10,
    1,
    330,
    1,
    1,
    325,
    1,
  ]);
  for (let step = 1; step <= STEPS; step++) {
    commands.push({ id: 1, command: 'delay', duration: SAMPLE_MS });
    const position = from.map((value, index) =>
      Math.round(value + ((to[index] - value) * step) / STEPS)
    );
    emit([3, 47, 0, 3, 53, position[0], 3, 54, position[1]]);
  }
  commands.push({ id: 1, command: 'delay', duration: SAMPLE_MS });
  emit([3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0]);
  commands.push({ id: 1, command: 'delay', duration: 500 });
  writeFileSync(LOCAL, commands.map((command) => JSON.stringify(command)).join('\n') + '\n');
  try {
    adb('push', LOCAL, REMOTE);
    guard();
    adb('shell', 'uinput', REMOTE);
  } finally {
    adb('shell', 'rm', '-f', REMOTE);
  }
}
