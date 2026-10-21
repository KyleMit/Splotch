import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const original = JSON.parse(
  readFileSync(
    'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-run2-ai-original-preferences.json'
  )
);
import { adb, capture, tap } from './android-driver.mjs';
import { open, toggle, node } from './android-run2-settings-helpers.mjs';
adb('shell', 'svc', 'wifi', 'disable');
adb('shell', 'svc', 'data', 'disable');
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
capture('android-run2-ai-recovery-root');
let xml = open('AI Art', 'android-run2-ai-recovery');
if (node(xml, 'Create AI Images', 'Switch').includes('checked="false"')) {
  toggle(xml, 'Create AI Images', false);
  xml = capture('android-run2-ai-recovery-enabled');
}
for (const label of ['Customize AI Style', 'Auto-Save AI Images']) {
  const current = node(xml, label, 'Switch').includes('checked="true"');
  if (current !== original[label]) {
    toggle(xml, label, current);
    xml = capture(`android-run2-ai-recovery-${label.split(' ')[0]}-restored`);
  }
  assert.ok(node(xml, label, 'Switch').includes(`checked="${original[label]}"`));
}
tap('Close');
xml = open('AI Art', 'android-run2-ai-recovery-disable');
if (node(xml, 'Create AI Images', 'Switch').includes('checked="true"'))
  toggle(xml, 'Create AI Images', true);
xml = capture('android-run2-ai-recovery-disabled');
assert.ok(node(xml, 'Create AI Images', 'Switch').includes('checked="false"'));
tap('Close');
adb('shell', 'svc', 'wifi', 'enable');
adb('shell', 'svc', 'data', 'enable');
