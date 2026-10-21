import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { capture, tap, OUT } from './android-driver.mjs';
import { open, restart, node, toggle } from './android-run2-settings-helpers.mjs';
const brushes = ['Eraser', 'Crayon', 'Magic brush'],
  checks = [];
restart('android-run2-combo-root');
tap('Purple');
tap('Brushes');
tap('Pen');
for (const [index, sole] of brushes.entries()) {
  let xml = open('Tool Drawer', `android-run2-combo-${index}-settings`);
  for (const b of brushes) {
    const current = node(xml, b, 'Switch').includes('checked="true"');
    if (current !== (b === sole)) {
      toggle(xml, b, current);
      xml = capture(`android-run2-combo-${index}-${b.split(' ')[0]}-availability`);
    }
  }
  tap('Close');
  xml = capture(`android-run2-combo-${index}-sole`);
  assert.ok(!xml.includes('content-desc="Brushes"'));
  assert.ok(xml.includes(`content-desc="${sole}"`));
  tap(sole);
  xml = capture(`android-run2-combo-${index}-on`);
  const active = node(xml, sole);
  assert.ok(/(?:selected|checked)="true"/.test(active), 'Sole optional brush not active');
  tap(sole);
  xml = capture(`android-run2-combo-${index}-off`);
  assert.ok(!/(?:selected|checked)="true"/.test(node(xml, sole)));
  checks.push({ case: `sole-${sole}-direct-toggle`, status: 'pass' });
  tap(sole);
  xml = open('Tool Drawer', `android-run2-combo-${index}-disable-active`);
  toggle(xml, sole, true);
  capture(`android-run2-combo-${index}-active-disabled`);
  tap('Close');
  xml = capture(`android-run2-combo-${index}-fallback`);
  assert.ok(!xml.includes('content-desc="Brushes"'));
  for (const b of brushes) assert.ok(!xml.includes(`content-desc="${b}"`));
  tap('Stroke width');
  xml = capture(`android-run2-combo-${index}-fallback-width`);
  assert.ok(xml.includes('content-desc="Size 3"'));
  assert.ok(!xml.includes('content-desc="Eraser size 3"'));
  tap('Size 3');
  checks.push({ case: `disable-active-${sole}-falls-back-to-pen`, status: 'pass' });
  writeFileSync(
    `${OUT}/android-run2-brush-combinations-results.json`,
    JSON.stringify({ checks, restorationPending: true }, null, 2) + '\n'
  );
}
let xml = open('Tool Drawer', 'android-run2-combo-restore');
for (const b of brushes) {
  const current = node(xml, b, 'Switch').includes('checked="true"');
  if (!current) {
    toggle(xml, b, false);
    xml = capture(`android-run2-combo-restore-${b.split(' ')[0]}`);
  }
}
tap('Close');
tap('Brushes');
tap('Pen');
capture('android-run2-combo-restored');
writeFileSync(
  `${OUT}/android-run2-brush-combinations-results.json`,
  JSON.stringify({ checks, restorationPending: false }, null, 2) + '\n'
);
