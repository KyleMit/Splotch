import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import { pageRow, headerRow, titleBar } from './fig-rows.mjs';

const PAGES = [
  ['farm/dog-tall', 'light', 9.56],
  ['shapes/heart-tall', 'light', 8.56],
  ['space/astronaut-wide', 'light', 6.9],
  ['farm/horse-tall', 'night', 6.58],
  ['space/ship-wide', 'night', 6.58],
  ['farm/horse-wide', 'night', 5.6],
];

const rows = [];
for (const [rel, theme, ceiling] of PAGES) {
  const { row, r } = await pageRow(rel, theme, { ceiling });
  rows.push(row);
  console.log(rel, theme, r.localWarpMax.toFixed(2));
}
const width = rows[0].width;
const head = await v.png(headerRow(width, ['where on the page', 'line art', 'painted fill', 'magenta line / cyan paint', 'correlation surface ±12px', 'scorer read-out'], 240));
const title = await v.png(titleBar(width, 'The six committed fills that sit above the strict 4px gate',
  'Each is grandfathered by a per-page ceiling in notes.json, not silently ignored. The red box marks the tile the scorer picked.'));
const stack = [title];
for (const r of rows) { stack.push(head); stack.push({ buffer: r.buffer, width: r.width, height: r.height }); }
await writeFile('out/fig-overgate.png', await v.stackRows(stack));
console.log('done');
