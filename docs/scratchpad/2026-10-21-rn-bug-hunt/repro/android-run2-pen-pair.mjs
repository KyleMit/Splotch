import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { tap, capture, OUT } from './android-driver.mjs';
import { restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line } from './android-run2-touch.mjs';
restart('android-run2-pen-pair-root');
tap('Purple');
tap('Brushes');
tap('Pen');
capture('android-run2-pen-pair-blank');
const crop = { left: 200, top: 600, width: 700, height: 1300 },
  checks = [];
const digest = async (name) =>
  createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
const blank = await digest('android-run2-pen-pair-blank');
for (const n of [2, 5]) {
  const tag = `android-run2-Pen-${n}-contacts`;
  await inject(
    tag,
    pathCommands(
      Array.from({ length: n }, (_, c) =>
        line([350 + c * 65, 900 + c * 120], [750 + c * 30, 1050 + c * 120])
      )
    )
  );
  capture(tag);
  assert.notEqual(await digest(tag), blank);
  tap('Undo');
  capture(`${tag}-undo`);
  assert.equal(await digest(`${tag}-undo`), blank);
  checks.push({ case: `Pen-${n}-contacts`, status: 'pass', undoExact: true });
}
writeFileSync(`${OUT}/android-run2-pen-pair-results.json`, JSON.stringify(checks, null, 2) + '\n');
