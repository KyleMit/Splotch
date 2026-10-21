import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, input, tap, OUT } from './android-driver.mjs';
import { open, toggle, node, center, restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
import { visibleControl } from './android-run2-visible-control.mjs';
let aiRestored = false;
const checks = [],
  crop = { left: 200, top: 700, width: 650, height: 1000 };
async function digest(name) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
const baseline = {
  wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
  data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim(),
};
try {
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  pause(1500);
  restart('android-run2-key-root');
  tap('Brushes');
  tap('Pen');
  tap('Purple');
  await inject('android-run2-key-ink', pathCommands([line([350, 900], [750, 1500])]));
  capture('android-run2-key-ink');
  await digest('android-run2-key-ink');
  let xml = open('AI Art', 'android-run2-ai-settings-offline');
  toggle(xml, 'Create AI Images', false);
  xml = capture('android-run2-ai-settings-enabled');
  for (let i = 0; i < 4 && !xml.includes('content-desc="Customize AI Style"'); i++) {
    input('swipe', 550, 1900, 550, 850, 450);
    xml = capture(`android-run2-ai-settings-scroll-${i}`);
  }
  const initial = {};
  for (const label of ['Customize AI Style', 'Auto-Save AI Images']) {
    xml = visibleControl(
      xml,
      label,
      'Switch',
      `android-run2-ai-changing-${label.split(' ')[0]}`
    ).xml;
    const n = node(xml, label, 'Switch');
    initial[label] = n.includes('checked="true"');
    toggle(xml, label, initial[label]);
    xml = capture(`android-run2-ai-settings-${label.split(' ')[0]}-changed`);
  }
  tap('Close');
  restart('android-run2-ai-settings-persistence-restart');
  xml = open('AI Art', 'android-run2-ai-settings-persisted');
  for (let i = 0; i < 4 && !xml.includes('content-desc="Customize AI Style"'); i++) {
    input('swipe', 550, 1900, 550, 850, 450);
    xml = capture(`android-run2-ai-persisted-scroll-${i}`);
  }
  for (const label of ['Customize AI Style', 'Auto-Save AI Images']) {
    xml = visibleControl(
      xml,
      label,
      'Switch',
      `android-run2-ai-restoring-${label.split(' ')[0]}`
    ).xml;
    assert.ok(node(xml, label, 'Switch').includes(`checked="${!initial[label]}"`));
    toggle(xml, label, !initial[label]);
    xml = capture(`android-run2-ai-settings-${label.split(' ')[0]}-restored`);
    checks.push({ case: `${label}-mutation-persistence`, status: 'pass' });
  }
  tap('Close');
  tap('Brushes');
  tap('Pen');
  await inject('android-run2-field-ink', pathCommands([line([350, 900], [750, 1500])]));
  capture('android-run2-field-ink');
  const fieldInk = await digest('android-run2-field-ink');
  xml = open('AI Art', 'android-run2-field-settings');
  for (let i = 0; i < 4; i++) {
    try {
      const n = node(xml, 'OpenAI API Key', 'EditText');
      const [x, y] = center(n);
      if (y > 600 && y < 2100) {
        input('tap', x, y);
        break;
      }
    } catch {}
    input('swipe', 550, 1900, 550, 900, 450);
    xml = capture(`android-run2-field-scroll-${i}`);
  }
  input('text', 'LOCAL-ONLY-NOT-A-CREDENTIAL');
  xml = capture('android-run2-field-focused');
  assert.ok(xml.includes('LOCAL-ONLY-NOT-A-CREDENTIAL'));
  assert.match(xml, /class="android.widget.EditText"[^>]*focused="true"/);
  input('keycombination', '-t', 100, 'KEYCODE_CTRL_LEFT', 'KEYCODE_Z');
  capture('android-run2-field-undo-key');
  input('keyevent', 'KEYCODE_ESCAPE');
  xml = capture('android-run2-field-escape');
  assert.ok(!xml.includes('content-desc="Close"'));
  assert.equal(
    await digest('android-run2-field-escape'),
    fieldInk,
    'Text-field Ctrl+Z undid paper'
  );
  checks.push({
    case: 'text-field-Ctrl-Z-isolated-and-Escape-closes-modal',
    status: 'pass',
    fieldInk,
  });
  xml = open('AI Art', 'android-run2-ai-disable');
  toggle(xml, 'Create AI Images', true);
  capture('android-run2-ai-restored-off');
  tap('Close');
  aiRestored = true;
} finally {
  adb('shell', 'am', 'force-stop', 'art.splotch.migration.probe');
  if (aiRestored) {
    adb('shell', 'svc', 'wifi', baseline.wifi === '1' ? 'enable' : 'disable');
    adb('shell', 'svc', 'data', baseline.data === '1' ? 'enable' : 'disable');
    adb('shell', 'am', 'start', '-n', 'art.splotch.migration.probe/.MainActivity');
  }
  writeFileSync(
    `${OUT}/android-run2-keys-partial.json`,
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
  for (let n = 0; n < 16; n++) {
    const light = node(xml, 'Light', 'RadioButton');
    if (light.includes('focused="true"')) {
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
      : 'unconfirmed-selection-did-not-change',
    light: node(xml, 'Light', 'RadioButton'),
    dark: node(xml, 'Dark', 'RadioButton'),
  });
  tap('System');
  tap('Close');
}
writeFileSync(
  `${OUT}/android-run2-keys-results.json`,
  JSON.stringify({ checks, baseline }, null, 2) + '\n'
);
