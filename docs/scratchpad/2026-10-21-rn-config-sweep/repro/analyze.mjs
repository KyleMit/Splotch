import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('docs/scratchpad/2026-10-21-rn-config-sweep');
for (const serial of process.argv.slice(2)) {
  const file = path.join(root, 'results', serial + '.jsonl');
  const records = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const analyzed = [];
  for (const r of records) {
    const { data, info } = await sharp(path.join(root, r.evidence + '.png'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const p = r.controls.find((x) => x['content-desc'] === 'Drawing paper');
    const b = p?.bounds.match(/\d+/g).map(Number) ?? [
      0,
      Math.floor(info.height * 0.2),
      info.width,
      info.height,
    ];
    let count = 0,
      l = info.width,
      t = info.height,
      rr = 0,
      bb = 0;
    const mask = Buffer.alloc(info.width * info.height);
    for (let y = b[1] + 30; y < Math.min(b[3], info.height) - 150; y++)
      for (
        let x = b[0] + Math.round((b[2] - b[0]) * 0.19);
        x < Math.min(b[2], info.width) - 30;
        x++
      ) {
        const i = (y * info.width + x) * info.channels;
        if (
          data[i] > 115 &&
          data[i + 2] > 140 &&
          data[i] > data[i + 1] + 30 &&
          data[i + 2] > data[i + 1] + 40
        ) {
          count++;
          l = Math.min(l, x);
          t = Math.min(t, y);
          rr = Math.max(rr, x);
          bb = Math.max(bb, y);
          mask[y * info.width + x] = 1;
        }
      }
    analyzed.push({
      label: r.label,
      pid: r.pid,
      creates: r.createCountInRetainedLog,
      activity: r.localActivity,
      config: r.config,
      inkPixels: count,
      inkBounds: [l, t, rr, bb],
      inkHash: createHash('sha256').update(mask).digest('hex'),
      undo: r.controls.find((x) => x['content-desc'] === 'Undo'),
      size: [info.width, info.height],
    });
  }
  for (const row of analyzed.filter((x) => x.label.endsWith('-undo'))) {
    const prev = analyzed.find((x) => x.label === row.label.slice(0, -5));
    row.undoRemovedPixels = prev ? prev.inkPixels - row.inkPixels : null;
  }
  writeFileSync(
    path.join(root, 'results', serial + '-analysis.json'),
    JSON.stringify(analyzed, null, 2) + '\n'
  );
  console.log(
    serial,
    analyzed.map(({ label, pid, creates, inkPixels, undoRemovedPixels }) => ({
      label,
      pid,
      creates,
      inkPixels,
      undoRemovedPixels,
    }))
  );
}
