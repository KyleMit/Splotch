import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PACKAGE = 'art.splotch.migration.probe';
export const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
export function adb(...args) {
  return execFileSync('adb', ['-s', 'emulator-5680', ...args], {
    timeout: 45000,
    maxBuffer: 12 * 1024 * 1024,
  });
}
export function guard() {
  const state = adb('shell', 'dumpsys', 'window', 'displays').toString();
  const display = state.match(/Display: mDisplayId=0\b[\s\S]*?(?=Display: mDisplayId=|$)/)?.[0];
  const focus = display?.match(/mCurrentFocus=([^\n]+)/)?.[1];
  if (!focus?.includes(`${PACKAGE}/`)) throw new Error(`Foreground is ${focus}`);
}
export function input(...args) {
  guard();
  if (args.includes('KEYCODE_BACK') || args.includes('4'))
    throw new Error('Use guarded dialogBack for system Back');
  return adb('shell', 'input', ...args.map(String));
}
export function capture(name) {
  guard();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  let previous = '',
    run = 0,
    frame;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    guard();
    frame = adb('exec-out', 'screencap', '-p');
    const digest = createHash('sha256').update(frame).digest('hex');
    run = digest === previous ? run + 1 : 1;
    previous = digest;
    if (run === 3) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  writeFileSync(`${OUT}/${name}.png`, frame);
  writeFileSync(
    `${OUT}/${name}.settle.json`,
    JSON.stringify({ settled: run === 3, ms: Date.now() - started, digest: previous }) + '\n'
  );
  adb('shell', 'rm', '-f', '/data/local/tmp/rn-bughunt-ui.xml');
  const dumped = adb(
    'shell',
    'uiautomator',
    'dump',
    '/data/local/tmp/rn-bughunt-ui.xml'
  ).toString();
  if (!dumped.includes('dumped to:')) throw new Error('UI dump failed: ' + dumped);
  const xml = adb('shell', 'cat', '/data/local/tmp/rn-bughunt-ui.xml').toString();
  writeFileSync(`${OUT}/${name}.xml`, xml);
  console.log(
    name,
    [...xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1]).join(' | ')
  );
  return xml;
}
export function tap(label) {
  guard();
  adb('shell', 'rm', '-f', '/data/local/tmp/rn-bughunt-ui.xml');
  const dumped = adb(
    'shell',
    'uiautomator',
    'dump',
    '/data/local/tmp/rn-bughunt-ui.xml'
  ).toString();
  if (!dumped.includes('dumped to:')) throw new Error('UI dump failed: ' + dumped);
  const xml = adb('shell', 'cat', '/data/local/tmp/rn-bughunt-ui.xml').toString();
  const nodes = [];
  const ancestors = [];
  for (const [token] of xml.matchAll(/<\/?node\b[^>]*>/g)) {
    if (token.startsWith('</')) {
      ancestors.pop();
      continue;
    }
    const bounds = [...(token.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) ?? [])]
      .slice(1)
      .map(Number);
    const [left, top, right, bottom] = bounds;
    const x = (left + right) / 2,
      y = (top + bottom) / 2;
    const inside =
      right > left &&
      bottom > top &&
      ancestors.every((parent) => {
        if (!parent.scrollable) return true;
        const [a, b, c, d] = parent.bounds;
        return x >= a && x <= c && y >= b && y <= d;
      });
    if (inside) nodes.push(token);
    if (!token.endsWith('/>'))
      ancestors.push({ bounds, scrollable: token.includes('scrollable="true"') });
  }
  const node = nodes.find(
    (n) => n.includes(`content-desc="${label}"`) || n.includes(`text="${label}"`)
  );
  if (!node) throw new Error(`No node ${label}`);
  const [, x, y, x2, y2] = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) ?? [];
  if (!x) throw new Error(`No bounds for ${label}`);
  return input('tap', Math.round((+x + +x2) / 2), Math.round((+y + +y2) / 2));
}
export function dialogBack() {
  guard();
  adb('shell', 'rm', '-f', '/data/local/tmp/rn-bughunt-ui.xml');
  const dumped = adb(
    'shell',
    'uiautomator',
    'dump',
    '/data/local/tmp/rn-bughunt-ui.xml'
  ).toString();
  if (!dumped.includes('dumped to:')) throw new Error('UI dump failed: ' + dumped);
  const xml = adb('shell', 'cat', '/data/local/tmp/rn-bughunt-ui.xml').toString();
  if (!/content-desc="Close"|text="Grown-Ups Only"/.test(xml))
    throw new Error('No dialog to close with Back');
  guard();
  return adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
}
if (process.argv[1]?.endsWith('android-driver.mjs')) {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'capture') capture(args[0]);
  else if (action === 'tap') tap(args.join(' '));
  else if (action === 'input') input(...args);
  else if (action === 'back') dialogBack();
  else throw new Error('Use capture, tap, input or back');
}
