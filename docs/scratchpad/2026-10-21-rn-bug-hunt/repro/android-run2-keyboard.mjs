import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, input, tap, OUT } from './android-driver.mjs';
import { open, toggle, node, center, restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
const checks = [],
  crop = { left: 200, top: 700, width: 650, height: 1000 };
const digest = async (name) =>
  createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
const baseline = {
  wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
  data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim(),
};
let aiRestored = false;
try {
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  pause(1500);
  restart('android-run2-keyboard-root');
  tap('Brushes');
  tap('Pen');
  tap('Purple');
  await inject('android-run2-keyboard-ink', pathCommands([line([350, 900], [750, 1500])]));
  capture('android-run2-keyboard-ink');
  const ink = await digest('android-run2-keyboard-ink');
  let xml = open('AI Art', 'android-run2-keyboard-field');
  toggle(xml, 'Create AI Images', false);
  xml = capture('android-run2-keyboard-ai-on');
  const field = node(xml, 'OpenAI API Key', 'EditText');
  input('tap', ...center(field));
  input('text', 'LOCAL-ONLY-NOT-A-CREDENTIAL');
  xml = capture('android-run2-keyboard-field-focused');
  assert.ok(xml.includes('LOCAL-ONLY-NOT-A-CREDENTIAL'));
  assert.match(xml, /class="android.widget.EditText"[^>]*focused="true"/);
  input('keycombination', '-t', 100, 'KEYCODE_CTRL_LEFT', 'KEYCODE_Z');
  capture('android-run2-keyboard-field-ctrl-z');
  input('keyevent', 'KEYCODE_ESCAPE');
  xml = capture('android-run2-keyboard-field-escape');
  const escapeClosed = !xml.includes('content-desc="Close"');
  if (!escapeClosed) {
    tap('Close');
    xml = capture('android-run2-keyboard-field-close');
  }
  assert.equal(
    await digest(
      escapeClosed ? 'android-run2-keyboard-field-escape' : 'android-run2-keyboard-field-close'
    ),
    ink,
    'Text-field Ctrl+Z undid drawing'
  );
  checks.push({ case: 'text-field-Ctrl-Z-isolates-paper', status: 'pass', escapeClosed, ink });
  xml = open('AI Art', 'android-run2-keyboard-restore-ai');
  toggle(xml, 'Create AI Images', true);
  xml = capture('android-run2-keyboard-ai-off');
  assert.ok(node(xml, 'Create AI Images', 'Switch').includes('checked="false"'));
  tap('Close');
  aiRestored = true;
} finally {
  adb('shell', 'am', 'force-stop', 'art.splotch.migration.probe');
  if (aiRestored) {
    adb('shell', 'svc', 'wifi', baseline.wifi === '1' ? 'enable' : 'disable');
    adb('shell', 'svc', 'data', baseline.data === '1' ? 'enable' : 'disable');
    adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
    capture('android-run2-keyboard-relaunched');
  }
  writeFileSync(
    `${OUT}/android-run2-keyboard-partial.json`,
    JSON.stringify(
      { checks, baseline, aiRestored, networkRestorationPending: !aiRestored },
      null,
      2
    ) + '\n'
  );
}
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
  });
  tap('System');
  tap('Close');
}
writeFileSync(
  `${OUT}/android-run2-keys-results.json`,
  JSON.stringify({ checks, baseline, aiRestored }, null, 2) + '\n'
);
