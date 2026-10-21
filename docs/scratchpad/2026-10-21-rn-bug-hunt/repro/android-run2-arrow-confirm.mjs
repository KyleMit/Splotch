import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { capture, input, tap, OUT } from './android-driver.mjs';
import { open, node } from './android-run2-settings-helpers.mjs';
const results = [];
for (let run = 1; run <= 2; run++) {
  open('Appearance', `android-run2-arrow-confirm-${run}`);
  tap('Light');
  let xml = capture(`android-run2-arrow-confirm-${run}-light`);
  let focused = false;
  for (let n = 0; n < 10; n++) {
    if (node(xml, 'Light', 'RadioButton').includes('focused="true"')) {
      focused = true;
      break;
    }
    input('keyevent', 'KEYCODE_TAB');
    xml = capture(`android-run2-arrow-confirm-${run}-tab-${n}`);
  }
  assert.ok(focused);
  input('keyevent', 'KEYCODE_DPAD_RIGHT');
  xml = capture(`android-run2-arrow-confirm-${run}-right`);
  assert.ok(node(xml, 'Dark', 'RadioButton').includes('focused="true"'));
  const selectionAfterArrow = node(xml, 'Dark', 'RadioButton').includes('checked="true"');
  input('keyevent', 'KEYCODE_ENTER');
  xml = capture(`android-run2-arrow-confirm-${run}-enter`);
  assert.ok(node(xml, 'Dark', 'RadioButton').includes('checked="true"'));
  results.push({ run, selectionAfterArrow, selectionAfterEnter: true, status: 'pass' });
  tap('System');
  tap('Close');
}
writeFileSync(
  `${OUT}/android-run2-arrow-confirm-results.json`,
  JSON.stringify(results, null, 2) + '\n'
);
