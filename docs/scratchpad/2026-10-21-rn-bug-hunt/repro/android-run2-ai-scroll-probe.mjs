import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { restart, open, node, gate } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line } from './android-run2-touch.mjs';
const results = [];
function bounds(n) {
  return [...n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
}
for (let run = 1; run <= 2; run++) {
  restart(`android-run2-ai-scroll-repro-${run}-root`);
  let xml = open('AI Art', `android-run2-ai-scroll-repro-${run}`);
  assert.ok(node(xml, 'Create AI Images', 'Switch').includes('checked="true"'));
  const before = bounds(node(xml, 'Auto-Save AI Images', 'Switch'));
  await inject(
    `android-run2-ai-scroll-repro-${run}-gesture`,
    pathCommands([line([550, 1900], [550, 850])]),
    true
  );
  xml = capture(`android-run2-ai-scroll-repro-${run}-after`);
  const after = bounds(node(xml, 'Auto-Save AI Images', 'Switch'));
  results.push({
    run,
    before,
    after,
    fontScale: adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(),
    moved: JSON.stringify(before) !== JSON.stringify(after),
  });
  tap('Close');
}
let xml = open('Parent Center', 'android-run2-ai-scroll-positive-parent');
xml = gate(xml, 'android-run2-ai-scroll-positive-parent-unlocked');
const before = bounds(node(xml, 'Generating an AI image parental gate frequency'));
await inject(
  'android-run2-ai-scroll-positive-parent-gesture',
  pathCommands([line([550, 1900], [550, 850])]),
  true
);
xml = capture('android-run2-ai-scroll-positive-parent-after');
const after = bounds(node(xml, 'Generating an AI image parental gate frequency'));
const positive = { before, after, moved: JSON.stringify(before) !== JSON.stringify(after) };
tap('Close');
writeFileSync(
  `${OUT}/android-run2-ai-scroll-probe-results.json`,
  JSON.stringify({ results, positive }, null, 2) + '\n'
);
console.log({ results, positive });

assert.ok(positive.moved, 'Scroll positive control failed');
assert.ok(
  results.every((r) => r.moved),
  'AI settings do not scroll'
);
