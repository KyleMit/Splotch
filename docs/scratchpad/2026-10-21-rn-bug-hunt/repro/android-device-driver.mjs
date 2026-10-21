import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
export const PKG = 'art.splotch.migration.probe';
export const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
export const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function bounds(node) {
  return [...(node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) ?? [])].slice(1).map(Number);
}
export function center(node) {
  const [l, t, r, b] = bounds(node);
  assert.ok(r > l && b > t, 'Empty or reversed bounds');
  return [Math.round((l + r) / 2), Math.round((t + b) / 2)];
}
export function nodes(xml) {
  const parents = [],
    out = [];
  for (const [token] of xml.matchAll(/<\/?node\b[^>]*>/g)) {
    if (token.startsWith('</')) {
      parents.pop();
      continue;
    }
    const b = bounds(token);
    const [x, y] = b.length === 4 ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [-1, -1];
    const visible =
      b[2] > b[0] &&
      b[3] > b[1] &&
      parents.every(
        (p) =>
          !p.includes('scrollable="true"') ||
          (() => {
            const [l, t, r, b] = bounds(p);
            return x >= l && x <= r && y >= t && y <= b;
          })()
      );
    out.push({ token, visible, parents: [...parents] });
    if (!token.endsWith('/>')) parents.push(token);
  }
  return out;
}
export function deviceDriver(serial) {
  assert.ok(
    ['emulator-5680', 'emulator-5682', 'emulator-5684'].includes(serial),
    'Device outside explicit campaign allowlist'
  );
  const remote = `/data/local/tmp/rn-hunt-${serial}-ui.xml`;
  const adb = (...args) =>
    execFileSync('adb', ['-s', serial, ...args], { timeout: 45000, maxBuffer: 32 << 20 });
  const api = Number(adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim());
  let uinputAvailable;
  function guard() {
    if (api === 28) {
      const state = adb('shell', 'dumpsys', 'window', 'windows').toString();
      assert.ok(
        state.match(/mCurrentFocus=([^\n]+)/)?.[1]?.includes(`${PKG}/`),
        `Foreground mismatch on ${serial}`
      );
      return;
    }
    const state = adb('shell', 'dumpsys', 'window', 'displays').toString();
    const d = state.match(/Display: mDisplayId=0\b[\s\S]*?(?=Display: mDisplayId=|$)/)?.[0];
    assert.ok(
      d?.match(/mCurrentFocus=([^\n]+)/)?.[1]?.includes(`${PKG}/`),
      `Foreground mismatch on ${serial}`
    );
  }
  function source() {
    for (let attempt = 0; attempt < 3; attempt++) {
      guard();
      adb('shell', 'rm', '-f', remote);
      const dumped = adb('shell', 'uiautomator', 'dump', remote).toString();
      if (dumped.includes('dumped to:')) return adb('shell', 'cat', remote).toString();
      pause(500);
    }
    assert.fail('Fresh UI dump failed after three attempts');
  }
  function input(...args) {
    guard();
    assert.ok(!args.some((a) => ['KEYCODE_BACK', '4'].includes(String(a))), 'Root Back prohibited');
    return adb('shell', 'input', ...args.map(String));
  }
  function tap(label, { type, group } = {}) {
    const entries = nodes(source());
    const n = entries.find(
      ({ token, visible, parents }) =>
        visible &&
        (token.includes(`content-desc="${label}"`) || token.includes(`text="${label}"`)) &&
        (!type || token.includes(`class="android.widget.${type}"`)) &&
        (!group || parents.some((p) => p.includes(`content-desc="${group}"`)))
    );
    assert.ok(n, `No visible node ${label}`);
    input('tap', ...center(n.token));
  }
  function scrollTap(label) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entries = nodes(source());
      if (
        entries.some(
          ({ token, visible }) =>
            visible &&
            (token.includes(`content-desc="${label}"`) || token.includes(`text="${label}"`))
        )
      ) {
        tap(label);
        return;
      }
      const areas = entries
        .filter((n) => n.visible && n.token.includes('scrollable="true"'))
        .map((n) => bounds(n.token))
        .sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
      assert.ok(areas.length, `No scrollable area for ${label}`);
      const [l, t, r, b] = areas[0];
      input('swipe', Math.round((l + r) / 2), b - 40, Math.round((l + r) / 2), t + 40, 600);
    }
    tap(label);
  }
  function capture(name) {
    guard();
    pause(1000);
    let frame,
      last = '',
      run = 0;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      frame = adb('exec-out', 'screencap', '-p');
      const digest = createHash('sha256').update(frame).digest('hex');
      run = digest === last ? run + 1 : 1;
      last = digest;
      if (run === 3) break;
      pause(250);
    }
    writeFileSync(`${OUT}/${name}.png`, frame);
    writeFileSync(
      `${OUT}/${name}.settle.json`,
      JSON.stringify(
        { device: serial, settled: run === 3, ms: Date.now() - start, digest: last },
        null,
        2
      ) + '\n'
    );
    const xml = source();
    writeFileSync(`${OUT}/${name}.xml`, xml);
    console.log(
      name,
      [...xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1]).join(' | ')
    );
    return xml;
  }
  function launch() {
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
    pause(3000);
    guard();
  }
  function restart() {
    adb('shell', 'am', 'force-stop', PKG);
    launch();
  }
  async function inject(name, paths, { interval = 16 } = {}) {
    guard();
    if (uinputAvailable === undefined) {
      try {
        uinputAvailable = Boolean(adb('shell', 'command -v uinput').toString().trim());
      } catch {
        uinputAvailable = false;
      }
    }
    if (!uinputAvailable) {
      assert.equal(paths.length, 1, 'This image has no multi-contact injection tool');
      const path = paths[0],
        from = path[0],
        to = path.at(-1);
      assert.ok(
        path.every((point, i) =>
          point.every(
            (v, axis) =>
              Math.abs(v - (from[axis] + ((to[axis] - from[axis]) * i) / (path.length - 1))) <= 1
          )
        ),
        'Single-swipe fallback accepts linear paths only'
      );
      const durationMs = Math.max(300, interval * (path.length - 1));
      const inputRecord = {
        device: serial,
        method: 'adb input swipe',
        reason: 'uinput binary absent',
        from,
        to,
        durationMs,
        requestedPath: path,
      };
      writeFileSync(`${OUT}/${name}.input.json`, JSON.stringify(inputRecord, null, 2) + '\n');
      input('swipe', ...from, ...to, durationMs);
      pause(500);
      return inputRecord;
    }
    const { width, height } = await sharp(adb('exec-out', 'screencap', '-p')).metadata();
    const registration = JSON.parse(
      readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
    );
    for (const axis of registration.abs_info) {
      if (axis.code === 53) axis.info.maximum = width - 1;
      if (axis.code === 54) axis.info.maximum = height - 1;
    }
    const commands = [
        registration,
        { id: 1, command: 'inject', events: [0, 0, 0] },
        { id: 1, command: 'delay', duration: 1500 },
      ],
      emit = (events) => commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] }),
      delay = (duration) => commands.push({ id: 1, command: 'delay', duration });
    paths.forEach((p, c) =>
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
        p[0][0],
        3,
        54,
        p[0][1],
        3,
        48,
        10,
        ...(c === 0 ? [1, 330, 1, 1, 325, 1] : []),
      ])
    );
    for (let i = 1; i < Math.max(...paths.map((p) => p.length)); i++) {
      delay(interval);
      const events = [];
      paths.forEach((p, c) => {
        const at = p[Math.min(i, p.length - 1)];
        events.push(3, 47, c, 3, 53, at[0], 3, 54, at[1]);
      });
      emit(events);
    }
    delay(interval);
    for (let c = paths.length - 1; c >= 0; c--)
      emit([3, 47, c, 3, 57, -1, ...(c === 0 ? [1, 330, 0, 1, 325, 0] : [])]);
    delay(500);
    const file = `${OUT}/${name}.input.jsonl`,
      touch = '/data/local/tmp/rn-hunt-device-touch.jsonl';
    writeFileSync(file, commands.map((c) => JSON.stringify(c)).join('\n') + '\n');
    try {
      adb('push', file, touch);
      guard();
      adb('shell', 'uinput', touch);
    } finally {
      adb('shell', 'rm', '-f', touch);
    }
    return { device: serial, method: 'uinput', contacts: paths.length, input: file };
  }
  function back() {
    const xml = source();
    assert.ok(
      xml.includes('content-desc="Close"') || xml.includes('Grown-Ups Only'),
      'No modal Back target'
    );
    guard();
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
  return {
    serial,
    adb,
    guard,
    source,
    input,
    tap,
    scrollTap,
    capture,
    launch,
    restart,
    inject,
    back,
    cleanup: () => adb('shell', 'rm', '-f', remote),
  };
}
