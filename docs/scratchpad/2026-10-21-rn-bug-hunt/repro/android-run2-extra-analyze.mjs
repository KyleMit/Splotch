import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { OUT } from './android-driver.mjs';
const checks = [],
  crop = { left: 200, top: 600, width: 700, height: 1300 };
async function digest(name) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
const bg = await digest('android-run2-eraser-bg');
for (const suffix of ['1-contacts', '2-contacts', '5-contacts', 'dot']) {
  const name = `android-run2-eraser-${suffix}`;
  assert.notEqual(await digest(name), bg);
  assert.equal(await digest(`${name}-undo`), bg);
  checks.push({
    case: `eraser-${suffix}`,
    status: 'pass',
    undoExact: true,
    evidence: `${name}.png`,
  });
}
for (const b of ['Pen', 'Crayon', 'Magic']) {
  const name = `android-run2-edge-${b}`,
    blank = await digest(`${name}-reset`);
  assert.notEqual(await digest(name), blank);
  assert.equal(await digest(`${name}-undo`), blank);
  checks.push({
    case: `${b}-edge-crossings`,
    status: 'pass',
    undoExact: true,
    evidence: `${name}.png`,
  });
}
writeFileSync(
  `${OUT}/android-run2-drawing-extra-results.json`,
  JSON.stringify(checks, null, 2) + '\n'
);
console.log(checks);
