import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { adb, guard, OUT } from './android-driver.mjs';
const registration = JSON.parse(
  readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
);
export const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function pathCommands(paths, interval = 16) {
  const commands = [
    structuredClone(registration),
    { id: 1, command: 'inject', events: [0, 0, 0] },
    { id: 1, command: 'delay', duration: 1500 },
  ];
  const emit = (events) =>
    commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
  const delay = (duration) => commands.push({ id: 1, command: 'delay', duration });
  paths.forEach((points, c) =>
    emit([
      3,
      47,
      c,
      3,
      57,
      11 + c,
      3,
      55,
      0,
      3,
      53,
      points[0][0],
      3,
      54,
      points[0][1],
      3,
      48,
      10,
      ...(c === 0 ? [1, 330, 1, 1, 325, 1] : []),
    ])
  );
  for (let i = 1; i < Math.max(...paths.map((p) => p.length)); i++) {
    delay(interval);
    const events = [];
    paths.forEach((points, c) => {
      const p = points[Math.min(i, points.length - 1)];
      events.push(3, 47, c, 3, 53, p[0], 3, 54, p[1]);
    });
    emit(events);
  }
  delay(interval);
  for (let c = paths.length - 1; c >= 0; c--)
    emit([3, 47, c, 3, 57, -1, ...(c === 0 ? [1, 330, 0, 1, 325, 0] : [])]);
  delay(500);
  return commands;
}
export function line(from, to, steps = 60) {
  return Array.from({ length: steps + 1 }, (_, i) =>
    from.map((v, k) => Math.round(v + ((to[k] - v) * i) / steps))
  );
}
export async function inject(name, commands, trace = false) {
  const local = `${OUT}/${name}.input.jsonl`,
    remote = '/data/local/tmp/rn-hunt-run2-touch.jsonl';
  writeFileSync(local, commands.map((v) => JSON.stringify(v)).join('\n') + '\n');
  adb('push', local, remote);
  guard();
  let child, fd;
  if (trace) {
    fd = openSync(`${OUT}/${name}.getevent.txt`, 'w');
    child = spawn('adb', ['-s', 'emulator-5680', 'shell', 'getevent', '-lt'], {
      stdio: ['ignore', fd, fd],
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  const start = Date.now();
  try {
    adb('shell', 'uinput', remote);
  } finally {
    adb('shell', 'rm', '-f', remote);
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
      closeSync(fd);
    }
  }
  const timing = {
    startedAt: new Date(start).toISOString(),
    wallMs: Date.now() - start,
    scheduledMs: commands.filter((c) => c.command === 'delay').reduce((s, c) => s + c.duration, 0),
  };
  writeFileSync(`${OUT}/${name}.timing.json`, JSON.stringify(timing, null, 2) + '\n');
  return timing;
}
