import assert from 'node:assert/strict';
import { adb, capture, input, tap } from './android-driver.mjs';
export function node(xml, label, type) {
  const matches = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((m) => m[0])
    .filter(
      (n) =>
        (n.includes(`content-desc="${label}"`) || n.includes(`text="${label}"`)) &&
        (!type || n.includes(`class="android.widget.${type}"`))
    );
  assert.ok(matches.length, `Missing ${type ?? 'node'} ${label}`);
  return matches[0];
}
export function center(n) {
  const b = [...n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
  assert.ok(
    b[2] > b[0] && b[3] > b[1] && b[0] >= 0 && b[1] >= 0 && b[2] <= 1080 && b[3] <= 2400,
    `Invalid or offscreen bounds ${b}`
  );
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
export function toggle(xml, label, current) {
  const n = node(xml, label, 'Switch');
  assert.ok(n.includes(`checked="${current}"`), `${label} wrong initial state`);
  input('tap', ...center(n));
}
export function checked(xml, label, expected, type = 'RadioButton') {
  assert.ok(node(xml, label, type).includes(`checked="${expected}"`), `${label} != ${expected}`);
}
export function open(section, tag) {
  tap('Settings');
  capture(`${tag}-hub`);
  tap(section);
  return capture(`${tag}-section`);
}
export function restart(tag) {
  const p = 'art.splotch.migration.probe';
  adb('shell', 'am', 'force-stop', p);
  adb('shell', 'am', 'start', '-W', '-n', `${p}/.MainActivity`);
  return capture(tag);
}
export function gate(xml, tag) {
  const question = xml.match(/What is (\d+) times (\d+)\?/);
  assert.ok(question, 'No multiplication gate');
  const answer = String(Number(question[1]) * Number(question[2]));
  for (const d of answer) input('keyevent', `KEYCODE_${d}`);
  input('keyevent', 'KEYCODE_ENTER');
  return capture(tag);
}
