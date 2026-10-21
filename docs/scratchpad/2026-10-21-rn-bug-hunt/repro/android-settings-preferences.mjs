import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { adb, capture, input, tap, OUT } from './android-driver.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const checks = [];
function choice(xml, label, expected, type = 'Switch') {
  const node = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map(([value]) => value)
    .find(
      (value) =>
        value.includes(`class="android.widget.${type}"`) &&
        value.includes(`content-desc="${label}"`)
    );
  assert.ok(node, `Missing ${type} ${label}`);
  assert.ok(node.includes(`checked="${expected}"`), `${label} must be ${expected}`);
  return node;
}
function toggle(xml, label, current) {
  const node = choice(xml, label, current);
  const [left, top, right, bottom] = [...node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)]
    .slice(1)
    .map(Number);
  assert.ok(bottom > top && top >= 0 && bottom <= 2400, `Offscreen ${label}`);
  input('tap', Math.round((left + right) / 2), Math.round((top + bottom) / 2));
}
function open(section, tag) {
  tap('Settings');
  capture(`${tag}-hub`);
  tap(section);
  return capture(`${tag}-section`);
}
function restart(tag) {
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
  return capture(tag);
}
function pass(id, evidence) {
  checks.push({ id, status: 'pass', evidence: `${evidence}.xml` });
}

let state = open('Saving', 'android-prefs-saving-initial');
toggle(state, 'Camera button', true);
toggle(state, 'Auto-Save on Delete', false);
capture('android-prefs-saving-changed');
tap('Close');
state = capture('android-prefs-camera-hidden');
assert.ok(!state.includes('content-desc="Save screenshot"'));
pass('S08-camera-hidden', 'android-prefs-camera-hidden');
restart('android-prefs-saving-restarted');
state = open('Saving', 'android-prefs-saving-persisted');
choice(state, 'Camera button', false);
choice(state, 'Auto-Save on Delete', true);
pass('S08-saving-persistence', 'android-prefs-saving-persisted-section');
toggle(state, 'Camera button', false);
toggle(state, 'Auto-Save on Delete', true);
capture('android-prefs-saving-restored');
tap('Close');

state = open('Coloring', 'android-prefs-coloring-initial');
toggle(state, 'Coloring book', true);
capture('android-prefs-coloring-disabled');
tap('Close');
state = capture('android-prefs-coloring-hidden');
assert.ok(!state.includes('content-desc="Coloring books"'));
pass('S06-coloring-hidden', 'android-prefs-coloring-hidden');
restart('android-prefs-coloring-restarted');
state = open('Coloring', 'android-prefs-coloring-persisted');
choice(state, 'Coloring book', false);
assert.ok(state.includes('7 of 7 extra books'), 'Disabling coloring removed cached books');
pass('S06-coloring-persistence', 'android-prefs-coloring-persisted-section');
toggle(state, 'Coloring book', false);
capture('android-prefs-coloring-restored');
tap('Close');

state = open('Accessibility', 'android-prefs-motion-initial');
toggle(state, 'Reduce Motion', false);
capture('android-prefs-motion-enabled');
tap('Close');
restart('android-prefs-motion-restarted');
state = open('Accessibility', 'android-prefs-motion-persisted');
choice(state, 'Reduce Motion', true);
pass('S05-motion-persistence', 'android-prefs-motion-persisted-section');
toggle(state, 'Reduce Motion', true);
capture('android-prefs-motion-restored');
tap('Close');

state = open('Sound', 'android-prefs-sound-initial');
toggle(state, 'Sound', true);
capture('android-prefs-sound-disabled');
tap('Close');
restart('android-prefs-sound-restarted');
state = open('Sound', 'android-prefs-sound-persisted');
choice(state, 'Sound', false);
pass('S03-master-persistence', 'android-prefs-sound-persisted-section');
toggle(state, 'Sound', false);
state = capture('android-prefs-sound-enabled');
toggle(state, 'Drawing', true);
toggle(state, 'Deleting', true);
capture('android-prefs-sound-sources-disabled');
tap('Close');
restart('android-prefs-sources-restarted');
state = open('Sound', 'android-prefs-sources-persisted');
choice(state, 'Drawing', false);
choice(state, 'Deleting', false);
pass('S03-sources-persistence', 'android-prefs-sources-persisted-section');
toggle(state, 'Drawing', false);
toggle(state, 'Deleting', false);
capture('android-prefs-sound-restored');
tap('Close');

state = open('Appearance', 'android-prefs-appearance-initial');
choice(state, 'System', true, 'RadioButton');
choice(state, 'Raised', true, 'RadioButton');
tap('Dark');
tap('Flat');
capture('android-prefs-dark-flat-section');
tap('Close');
capture('android-prefs-dark-flat-root');
restart('android-prefs-appearance-restarted');
state = open('Appearance', 'android-prefs-appearance-persisted');
choice(state, 'Dark', true, 'RadioButton');
choice(state, 'Flat', true, 'RadioButton');
pass('S02-appearance-persistence', 'android-prefs-appearance-persisted-section');
tap('System');
tap('Raised');
capture('android-prefs-appearance-restored');
tap('Close');
capture('android-prefs-final-root');
writeFileSync(
  `${OUT}/android-settings-preferences-results.json`,
  JSON.stringify(
    {
      checks,
      restored: true,
      soundObservation: 'UI and persistence only; no audio capture',
      motionObservation: 'Preference only; no animation timing claim',
    },
    null,
    2
  ) + '\n'
);
