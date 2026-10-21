import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, OUT, pause } from './android-device-driver.mjs';

const serial = 'emulator-5684';
const AXIS_MAX = 32767;
const SAMPLE_MS = 16;
const TRACE_SECONDS = 10;
const LEGACY_TIMEOUT_EXIT_CODE = 142;
const d = deviceDriver(serial);
export async function kernelTouch(name, paths, onMidStroke = null) {
  assert.match(name, /^[a-zA-Z0-9-]+$/);
  assert.ok(paths.length >= 1 && paths.length <= 5);
  assert.equal(d.adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim(), '28');
  assert.match(d.adb('shell', 'wm', 'size').toString(), /Physical size: 1080x2160/);
  assert.equal(d.adb('shell', 'settings', 'get', 'system', 'user_rotation').toString().trim(), '0');
  d.guard();
  const dimensions = await sharp(d.adb('exec-out', 'screencap', '-p')).metadata();
  assert.equal(dimensions.width, 1080);
  assert.equal(dimensions.height, 2160);
  const capabilities = d.adb('shell', 'su', '0', 'getevent', '-lp').toString();
  assert.ok(capabilities.includes('/dev/input/event0') && capabilities.includes('"qwerty2"'));
  assert.match(capabilities, /ABS_MT_POSITION_X[^\n]*max 32767/);
  assert.match(capabilities, /ABS_MT_POSITION_Y[^\n]*max 32767/);
  const packets = [];
  const point = (slot, p) => [
    [3, 47, slot],
    [3, 53, Math.round((p[0] * AXIS_MAX) / 1079)],
    [3, 54, Math.round((p[1] * AXIS_MAX) / 2159)],
  ];
  const down = paths.flatMap((path, slot) => [
    [3, 47, slot],
    [3, 57, slot + 1],
    [3, 55, 0],
    ...point(slot, path[0]),
    [3, 48, 20],
    [3, 58, 64],
  ]);
  packets.push([...down, [3, 2, 1], [0, 0, 0]]);
  for (let i = 1; i < Math.max(...paths.map((p) => p.length)); i++)
    packets.push([
      ...paths.flatMap((path, slot) => point(slot, path[Math.min(i, path.length - 1)])),
      [0, 0, 0],
    ]);
  const up = [
    ...paths.flatMap((_, slot) => [
      [3, 47, slot],
      [3, 58, 0],
      [3, 57, -1],
    ]),
    [3, 2, 0],
    [0, 0, 0],
  ];
  packets.push(up);
  const fd = openSync(`${OUT}/${name}.getevent.txt`, 'w');
  // A remote PTY keeps the bounded tracer's final contact releases line-buffered.
  const trace = spawn(
    'adb',
    [
      '-s',
      serial,
      'shell',
      '-tt',
      'su',
      '0',
      'timeout',
      String(TRACE_SECONDS),
      'getevent',
      '-lt',
      '/dev/input/event0',
    ],
    { stdio: ['ignore', fd, fd] }
  );
  const completed = new Promise((resolve, reject) => {
    trace.once('error', reject);
    trace.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const send = (events) => {
    const reply = d.adb('emu', 'event', 'send', ...events.map((e) => e.join(':'))).toString();
    assert.ok(!reply.includes('KO:') && reply.includes('OK'), reply);
  };
  const startedAt = new Date().toISOString();
  const wall = [];
  let traceExit;
  try {
    pause(400);
    d.guard();
    send(up);
    send([[0, 0, 0]]);
    for (const [frame, events] of packets.entries()) {
      const at = Date.now();
      send(events);
      wall.push({ at, durationMs: Date.now() - at });
      pause(SAMPLE_MS);
      if (onMidStroke && frame === Math.floor(packets.length / 2)) await onMidStroke();
    }
  } finally {
    try {
      send(up);
    } finally {
      traceExit = await completed;
      closeSync(fd);
    }
    writeFileSync(
      `${OUT}/${name}.input.json`,
      JSON.stringify(
        {
          device: serial,
          method: 'emulator console event send to qwerty2 kernel device',
          startedAt,
          sampleMs: SAMPLE_MS,
          axisMax: AXIS_MAX,
          paths,
          packets,
          wall,
          traceExit,
        },
        null,
        2
      ) + '\n'
    );
  }
  assert.ok(
    [0, 124, LEGACY_TIMEOUT_EXIT_CODE].includes(traceExit.code),
    'Bounded getevent trace failed'
  );
  const summary = traceSummary(readFileSync(`${OUT}/${name}.getevent.txt`, 'utf8'));
  writeFileSync(`${OUT}/${name}.trace-summary.json`, JSON.stringify(summary, null, 2) + '\n');
  assert.equal(summary.downCount, paths.length);
  assert.equal(summary.upCount, paths.length);
  assert.equal(summary.finalActiveContacts, 0);
  return summary;
}

function traceSummary(text) {
  let slot = 0,
    downCount = 0,
    upCount = 0,
    frames = 0,
    maxContacts = 0,
    maxGapMs = 0,
    maxJumpPx = 0,
    previous = null;
  const slots = new Map();
  for (const row of text.split('\n')) {
    const match = row.match(/^\[\s*([\d.]+)\]\s+(EV_ABS|EV_SYN)\s+(\w+)\s+([a-f\d]+)/i);
    if (!match) continue;
    const time = Number(match[1]),
      code = match[3],
      value = parseInt(match[4], 16);
    if (code === 'ABS_MT_SLOT') slot = value;
    if (!slots.has(slot)) slots.set(slot, { active: false, x: null, y: null });
    const state = slots.get(slot);
    if (code === 'ABS_MT_TRACKING_ID') {
      if (value === 0xffffffff) {
        if (state.active) upCount++;
        state.active = false;
      } else {
        if (!state.active) downCount++;
        state.active = true;
      }
    }
    if (code === 'ABS_MT_POSITION_X') state.x = (value * 1079) / AXIS_MAX;
    if (code === 'ABS_MT_POSITION_Y') state.y = (value * 2159) / AXIS_MAX;
    if (code === 'SYN_REPORT') {
      frames++;
      const active = [...slots.entries()]
        .filter(([, s]) => s.active)
        .map(([id, s]) => ({ id, ...s }));
      maxContacts = Math.max(maxContacts, active.length);
      for (const point of active) {
        const before = previous?.active.find((p) => p.id === point.id);
        if (before) {
          maxGapMs = Math.max(maxGapMs, (time - previous.time) * 1000);
          maxJumpPx = Math.max(maxJumpPx, Math.hypot(point.x - before.x, point.y - before.y));
        }
      }
      previous = { time, active };
    }
  }
  return {
    frames,
    downCount,
    upCount,
    maxContacts,
    maxGapMs,
    maxJumpPx,
    finalActiveContacts: [...slots.values()].filter((s) => s.active).length,
  };
}
