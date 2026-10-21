import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { capture, input, tap, OUT } from './android-driver.mjs';
import { open, node, restart } from './android-run2-settings-helpers.mjs';
const results = [];
for (let run = 1; run <= 2; run++) {
  restart(`android-run2-segmented-${run}-root`);
  open('Appearance', `android-run2-segmented-${run}`);
  tap('Light');
  let xml = capture(`android-run2-segmented-${run}-light`);
  let focused = false;
  for (let n = 0; n < 10; n++) {
    if (node(xml, 'Light', 'RadioButton').includes('focused="true"')) {
      focused = true;
      break;
    }
    input('keyevent', 'KEYCODE_TAB');
    xml = capture(`android-run2-segmented-${run}-tab-${n}`);
  }
  assert.ok(focused, 'No Light focus');
  input('keyevent', 'KEYCODE_DPAD_RIGHT');
  xml = capture(`android-run2-segmented-${run}-right`);
  assert.ok(
    node(xml, 'Dark', 'RadioButton').includes('focused="true"'),
    'Right did not move focus'
  );
  const steps = [
    { key: 'Right', darkSelected: node(xml, 'Dark', 'RadioButton').includes('checked="true"') },
  ];
  for (const key of ['KEYCODE_ENTER', 'KEYCODE_SPACE', 'KEYCODE_DPAD_CENTER']) {
    input('keyevent', key);
    xml = capture(`android-run2-segmented-${run}-${key}`);
    steps.push({
      key,
      darkSelected: node(xml, 'Dark', 'RadioButton').includes('checked="true"'),
      darkFocused: node(xml, 'Dark', 'RadioButton').includes('focused="true"'),
    });
  }
  tap('Dark');
  xml = capture(`android-run2-segmented-${run}-touch-positive`);
  assert.ok(node(xml, 'Dark', 'RadioButton').includes('checked="true"'));
  results.push({ run, steps, touchSelects: true });
  tap('System');
  tap('Close');
}
writeFileSync(
  `${OUT}/android-run2-segmented-activation-results.json`,
  JSON.stringify({ results, restored: 'System' }, null, 2) + '\n'
);
assert.ok(
  results.every((r) => r.steps.some((s) => s.darkSelected)),
  'Keyboard cannot select an unselected segment'
);
