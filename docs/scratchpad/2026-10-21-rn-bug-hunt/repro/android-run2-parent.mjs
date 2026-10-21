import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { capture, input, tap, OUT } from './android-driver.mjs';
import { open, gate, restart, center } from './android-run2-settings-helpers.mjs';
const features = [
  'Generating an AI image',
  'Reporting an AI result',
  'Viewing external links',
  'Sending feedback',
  'Opening Parent Center',
];
const checks = [];
function row(xml, feature) {
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]);
  const label = nodes.find((n) => n.includes(`content-desc="${feature} parental gate frequency"`));
  if (!label) return null;
  const b = [...label.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
  if (b[3] <= b[1] || b[1] < 450 || b[3] > 2200) return null;
  return nodes
    .filter((n) => n.includes('class="android.widget.RadioButton"'))
    .filter((n) => {
      const bounds = [...n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
      if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1] || bounds[1] < 450 || bounds[3] > 2200)
        return false;
      const [x, y] = center(n);
      return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
    });
}
function visible(feature, tag) {
  let xml = capture(`${tag}-before`);
  for (let tries = 0; tries < 4; tries++) {
    const r = row(xml, feature);
    if (r?.length === 3) return { xml, r };
    input('swipe', 550, 1900, 550, 850, 450);
    xml = capture(`${tag}-scroll-${tries}`);
  }
  throw new Error(`No visible policy row ${feature}`);
}
function choose(feature, mode, tag) {
  const { r } = visible(feature, tag);
  const n = r.find((n) => n.includes(`content-desc="${mode}"`));
  assert.ok(n);
  input('tap', ...center(n));
  return capture(tag);
}
function selected(xml, feature, mode) {
  assert.ok(
    row(xml, feature)
      ?.find((n) => n.includes(`content-desc="${mode}"`))
      ?.includes('checked="true"'),
    `${feature} not ${mode}`
  );
}
let xml = open('Parent Center', 'android-run2-parent-initial');
if (xml.includes('Grown-Ups Only')) gate(xml, 'android-run2-parent-unlocked');
for (const [i, feature] of features.slice(0, 4).entries())
  for (const mode of ['Per session', 'Never', 'Every time']) {
    const tag = `android-run2-policy-${i}-${mode.replace(' ', '-')}`;
    xml = choose(feature, mode, tag);
    selected(xml, feature, mode);
    checks.push({ case: `${feature}-${mode}`, status: 'pass', evidence: `${tag}.xml` });
  }
const parent = features[4];
xml = choose(parent, 'Per session', 'android-run2-parent-session-choice');
selected(xml, parent, 'Per session');
tap('Close');
xml = open('Parent Center', 'android-run2-parent-session-first');
assert.ok(xml.includes('Grown-Ups Only'), 'Changed policy accepted old Every-time solve');
gate(xml, 'android-run2-parent-session-solved');
tap('Close');
xml = open('Parent Center', 'android-run2-parent-session-reopen');
assert.ok(!xml.includes('Grown-Ups Only'));
checks.push({ case: 'parent-per-session-first-solve-and-reuse', status: 'pass' });
tap('Close');
restart('android-run2-parent-session-cold');
xml = open('Parent Center', 'android-run2-parent-session-cold-gate');
assert.ok(xml.includes('Grown-Ups Only'));
gate(xml, 'android-run2-parent-session-cold-solved');
checks.push({ case: 'parent-per-session-rearms-on-process-death', status: 'pass' });
xml = choose(parent, 'Never', 'android-run2-parent-never-cancel-dialog');
assert.ok(xml.includes('Turn off the Parent Center check?'));
tap('Keep it on');
xml = visible(parent, 'android-run2-parent-never-canceled').xml;
selected(xml, parent, 'Per session');
checks.push({ case: 'parent-never-confirmation-cancel', status: 'pass' });
xml = choose(parent, 'Never', 'android-run2-parent-never-confirm-dialog');
assert.ok(xml.includes('Turn off the Parent Center check?'));
tap('Turn it off');
xml = visible(parent, 'android-run2-parent-never-confirmed').xml;
selected(xml, parent, 'Never');
assert.ok(xml.includes('This check is off'));
tap('Close');
restart('android-run2-parent-never-cold');
xml = open('Parent Center', 'android-run2-parent-never-cold-open');
assert.ok(!xml.includes('Grown-Ups Only'));
checks.push({ case: 'parent-never-confirmed-and-persists', status: 'pass' });
xml = choose(parent, 'Every time', 'android-run2-parent-always-restored');
selected(xml, parent, 'Every time');
tap('Close');
xml = open('Parent Center', 'android-run2-parent-always-rearmed');
assert.ok(xml.includes('Grown-Ups Only'));
gate(xml, 'android-run2-parent-always-solved');
tap('Close');
checks.push({ case: 'parent-every-time-restored-and-rearmed', status: 'pass' });
writeFileSync(
  `${OUT}/android-run2-parent-results.json`,
  JSON.stringify({ checks, restored: 'all five Every time' }, null, 2) + '\n'
);
