import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { OUT } from './android-driver.mjs';
const crop = { left: 200, top: 600, width: 730, height: 1400 },
  results = [];
async function pixels(name) {
  return sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer({ resolveWithObject: true });
}
for (let run = 1; run <= 3; run++) {
  const name = `android-run2-magic-calibrated-timing-${run}`;
  const trace = JSON.parse(readFileSync(`${OUT}/${name}.trace-summary.json`));
  assert.ok(trace.maxGapMs < 100);
  assert.ok(trace.maxJumpPx < 100);
  const { data, info } = await pixels(name),
    mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    const [r, g, b] = data.subarray(i * info.channels, i * info.channels + 3);
    mask[i] = Math.max(r, g, b) - Math.min(r, g, b) > 25 && Math.min(r, g, b) < 220 ? 1 : 0;
  }
  const areas = [];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const stack = [i];
      mask[i] = 0;
      let area = 0;
      while (stack.length) {
        const k = stack.pop();
        area++;
        const x = k % info.width,
          y = Math.floor(k / info.width);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= info.width || yy >= info.height) continue;
            const j = yy * info.width + xx;
            if (mask[j]) {
              mask[j] = 0;
              stack.push(j);
            }
          }
      }
      if (area >= 20) areas.push(area);
    }
  assert.equal(areas.length, 1, `${name} fragmented: ${areas}`);
  const digest = async (n) =>
    createHash('sha256')
      .update((await pixels(n)).data)
      .digest('hex');
  assert.equal(await digest(`${name}-undo`), await digest(`${name}-blank`));
  results.push({
    run,
    status: 'pass',
    components: areas,
    firstMove: trace.firstMove,
    maxGapMs: trace.maxGapMs,
    maxJumpPx: trace.maxJumpPx,
    undoExact: true,
  });
}
writeFileSync(
  `${OUT}/android-run2-magic-corrected-verdict.json`,
  JSON.stringify({ classification: 'test-script-artifact', results }, null, 2) + '\n'
);
console.log(results);
