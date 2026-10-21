import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { OUT } from './android-driver.mjs';
const crop = { left: 200, top: 600, width: 730, height: 1400 };
async function digest(name) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
const results = JSON.parse(readFileSync(`${OUT}/android-run2-drawing-results.json`));
for (const label of ['Crayon', 'Magic']) {
  const base = await digest(`android-run2-${label}-widths`);
  for (const n of [1, 2, 5]) {
    const name = `android-run2-${label}-${n}-contacts`;
    assert.notEqual(await digest(name), base);
    assert.equal(await digest(`${name}-undo`), base, `${name} did not undo cohort`);
    const r = results.find(
      (r) => r.case === `${label === 'Magic' ? 'Magic brush' : label}-${n}-contact-cohort`
    );
    r.status = 'pass';
    r.paperDigest = base;
  }
}
for (let run = 1; run <= 2; run++) {
  const name = `android-run2-magic-clean-${run}`;
  const log = readFileSync(`${OUT}/${name}.getevent.txt`, 'utf8');
  const devices = [...log.matchAll(/add device \d+: (\S+)\s+name:\s+"RN Hunt Touchscreen"/g)].map(
    (m) => m[1]
  );
  const byDevice = new Map();
  for (const m of log.matchAll(
    /\[\s*([\d.]+)\]\s+(\/dev\/input\/event\d+):\s+EV_SYN\s+SYN_REPORT/g
  )) {
    const d = m[2];
    const a = byDevice.get(d) ?? [];
    a.push(+m[1]);
    byDevice.set(d, a);
  }
  const streams = [...byDevice].map(([device, times]) => ({
    device,
    frames: times.length,
    maxGapMs: Math.max(...times.slice(1).map((v, i) => (v - times[i]) * 1000)),
    first: times[0],
    last: times.at(-1),
  }));
  writeFileSync(
    `${OUT}/${name}.trace-summary.json`,
    JSON.stringify({ devices, streams }, null, 2) + '\n'
  );
  const { data, info } = await sharp(`${OUT}/${name}.png`)
    .extract(crop)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
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
  const r = results.find((r) => r.case === `magic-clean-${run}`);
  r.components = areas.sort((a, b) => b - a);
  r.trace = streams;
  r.status = areas.length === 1 ? 'pass' : 'needs-inspection';
}
writeFileSync(`${OUT}/android-run2-drawing-verified.json`, JSON.stringify(results, null, 2) + '\n');
console.log(results);
