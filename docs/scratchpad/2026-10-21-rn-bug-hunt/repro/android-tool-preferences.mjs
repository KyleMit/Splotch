import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { adb, capture, tap, OUT } from './android-driver.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const TOOLS = ['Crayon', 'Magic brush', 'Eraser', 'Stroke width', 'Undo'];
const checks = [];
function checkSwitch(xml, label, expected) {
  const node = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map(([value]) => value)
    .find(
      (value) =>
        value.includes('class="android.widget.Switch"') && value.includes(`content-desc="${label}"`)
    );
  assert.ok(node, `Missing switch ${label}`);
  assert.ok(node.includes(`checked="${expected}"`), `${label} must be ${expected}`);
}
function restart() {
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
}
function openTools(name) {
  tap('Settings');
  capture(`${name}-hub`);
  tap('Tool Drawer');
  return capture(`${name}-section`);
}

let state = capture('android-tool-preferences-initial');
assert.ok(state.includes('text="Tool Drawer"'), 'Start on Tool Drawer section');
for (const tool of ['Enable tool drawer', ...TOOLS]) checkSwitch(state, tool, true);
for (const tool of TOOLS) tap(tool);
state = capture('android-tools-all-optional-off');
for (const tool of TOOLS) checkSwitch(state, tool, false);
checks.push({
  id: 'S04-optional-off',
  status: 'pass',
  evidence: 'android-tools-all-optional-off.xml',
});
tap('Close');
state = capture('android-tools-off-root');
if (state.includes('content-desc="Expand controls"')) tap('Expand controls');
state = capture('android-tools-off-expanded');
for (const label of ['Brushes', 'Stroke width', 'Undo'])
  assert.ok(!state.includes(`content-desc="${label}"`), `${label} remains visible`);
checks.push({
  id: 'S04-root-tools-hidden',
  status: 'pass',
  evidence: 'android-tools-off-expanded.xml',
});
restart();
capture('android-tools-off-restarted');
state = openTools('android-tool-off-persisted');
for (const tool of TOOLS) checkSwitch(state, tool, false);
checks.push({
  id: 'L01-tool-preferences-persist',
  status: 'pass',
  evidence: 'android-tool-off-persisted-section.xml',
});
for (const tool of TOOLS) tap(tool);
state = capture('android-tools-options-restored');
for (const tool of TOOLS) checkSwitch(state, tool, true);
tap('Enable tool drawer');
state = capture('android-drawer-disabled-settings');
checkSwitch(state, 'Enable tool drawer', false);
tap('Close');
state = capture('android-drawer-disabled-root');
for (const label of ['Brushes', 'Stroke width', 'Undo'])
  assert.ok(!state.includes(`content-desc="${label}"`), `${label} remains visible`);
for (const label of ['Save screenshot', 'Coloring books'])
  assert.ok(state.includes(`content-desc="${label}"`), `${label} disappeared`);
restart();
capture('android-drawer-disabled-restarted');
state = openTools('android-drawer-disabled-persisted');
checkSwitch(state, 'Enable tool drawer', false);
checks.push({
  id: 'S04-drawer-disable-persists',
  status: 'pass',
  evidence: 'android-drawer-disabled-restarted.xml',
});
tap('Enable tool drawer');
state = capture('android-drawer-preferences-restored');
for (const tool of ['Enable tool drawer', ...TOOLS]) checkSwitch(state, tool, true);
tap('Close');
capture('android-tool-preferences-final-root');
writeFileSync(
  `${OUT}/android-tool-preferences-results.json`,
  JSON.stringify({ checks, restored: true }, null, 2) + '\n'
);
