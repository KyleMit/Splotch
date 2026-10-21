import { readFileSync, writeFileSync } from 'node:fs';
import { adb, capture, input, tap, OUT } from './android-driver.mjs';
import { open, node } from './android-run2-settings-helpers.mjs';
const partial = JSON.parse(readFileSync(`${OUT}/android-run2-keyboard-partial.json`)),
  checks = [...partial.checks];
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
capture('android-run2-arrows-landed-root');
for (let run = 1; run <= 2; run++) {
  open('Appearance', `android-run2-arrow-${run}-open`);
  tap('Light');
  let xml = capture(`android-run2-arrow-${run}-light`);
  let focused = false;
  for (let n = 0; n < 24; n++) {
    if (node(xml, 'Light', 'RadioButton').includes('focused="true"')) {
      focused = true;
      break;
    }
    input('keyevent', 'KEYCODE_TAB');
    xml = capture(`android-run2-arrow-${run}-tab-${n}`);
  }
  if (!focused) {
    checks.push({ case: `segmented-arrows-${run}`, status: 'blocked-no-native-radio-focus' });
    tap('System');
    tap('Close');
    continue;
  }
  input('keyevent', 'KEYCODE_DPAD_RIGHT');
  xml = capture(`android-run2-arrow-${run}-right`);
  checks.push({
    case: `segmented-arrows-${run}`,
    status: node(xml, 'Dark', 'RadioButton').includes('checked="true"')
      ? 'pass'
      : 'needs-review-selection-unchanged',
    light: node(xml, 'Light', 'RadioButton'),
    dark: node(xml, 'Dark', 'RadioButton'),
    focused: [...xml.matchAll(/<node\b[^>]*focused="true"[^>]*>/g)].map((m) => m[0]),
  });
  tap('System');
  tap('Close');
  writeFileSync(
    `${OUT}/android-run2-keys-results.json`,
    JSON.stringify(
      { checks, baseline: partial.baseline, aiRestored: partial.aiRestored },
      null,
      2
    ) + '\n'
  );
}
