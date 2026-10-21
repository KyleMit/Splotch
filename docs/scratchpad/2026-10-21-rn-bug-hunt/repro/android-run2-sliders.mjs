import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { capture, input, tap, OUT } from './android-driver.mjs';
import { open, restart, center, checked } from './android-run2-settings-helpers.mjs';
const checks = [];
function percentage(xml, label) {
  return Number(slider(xml, label).match(/content-desc="[^"]*, (\d+)%"/)[1]);
}
function slider(xml, label) {
  const n = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((m) => m[0])
    .find(
      (n) => n.includes('class="android.widget.SeekBar"') && n.includes(`content-desc="${label}, `)
    );
  assert.ok(n, `Missing slider ${label}`);
  return n;
}
for (const [section, label, min, restore] of [
  ['Sound', 'Volume', 0, 50],
  ['Accessibility', 'Button Size', 70, 100],
]) {
  let xml = open(section, `android-run2-${section}-slider`);
  const n = slider(xml, label);
  console.log('slider', n);
  const [x, y] = center(n);
  for (let sweep = 0; sweep < 2; sweep++)
    input('swipe', Math.round(x), Math.round(y), 20, Math.round(y), 700);
  xml = capture(`android-run2-${section}-min`);
  assert.ok(xml.includes(`${min}%`), `Missing ${min}%`);
  tap('Close');
  restart(`android-run2-${section}-min-restart`);
  xml = open(section, `android-run2-${section}-min-persisted`);
  assert.ok(xml.includes(`${min}%`));
  checks.push({ case: `${label}-minimum-persistence`, status: 'pass' });
  const [x2, y2] = center(slider(xml, label));
  for (let sweep = 0; sweep < 2; sweep++)
    input('swipe', Math.round(x2), Math.round(y2), 1070, Math.round(y2), 700);
  xml = capture(`android-run2-${section}-max`);
  assert.equal(percentage(xml, label), section === 'Sound' ? 100 : 130);
  checks.push({
    case: `${label}-maximum`,
    status: 'pass',
    values: [...xml.matchAll(/(?:text|content-desc)="(\d+%)"/g)].map((m) => m[1]),
  });
  tap('Close');
  restart(`android-run2-${section}-max-restart`);
  xml = open(section, `android-run2-${section}-max-persisted`);
  assert.equal(percentage(xml, label), section === 'Sound' ? 100 : 130);
  const sliderNode = slider(xml, label);
  const [cx, cy] = center(sliderNode);
  const current = Number(xml.match(/text="(\d+)%"/)?.[1]);
  assert.ok(Number.isFinite(current));
  const bounds = [...sliderNode.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)]
    .slice(1)
    .map(Number);
  const range = (section === 'Sound' ? 100 : 130) - min;
  const dx = range ? ((restore - current) / range) * (bounds[2] - bounds[0]) : 0;
  input('swipe', Math.round(cx), Math.round(cy), Math.round(cx + dx), Math.round(cy), 700);
  xml = capture(`android-run2-${section}-restored`);
  assert.ok(xml.includes(`${restore}%`), `Restore ${label} failed`);
  tap('Close');
}
open('Appearance', 'android-run2-appearance-all');
let xml;
for (const label of ['Light', 'Dark', 'System', 'Flat', 'Raised', 'Auto', 'Portrait']) {
  tap(label);
  xml = capture(`android-run2-appearance-${label}`);
  checked(xml, label, true);
  checks.push({ case: `appearance-${label}`, status: 'pass' });
}
tap('Close');
writeFileSync(`${OUT}/android-run2-sliders-results.json`, JSON.stringify(checks, null, 2) + '\n');
