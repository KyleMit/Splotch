import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import sharp from 'sharp';
const id = process.argv[2];
assert(
  /^(chromium|webkit|firefox)\/(phone|tablet|desktop)-\d+x\d+\/(light|dark)-(buttons|bare)-(100|130)$/.test(
    id
  ),
  'Pass engine/viewport/theme-style-size'
);
const MAX_THUMB_WIDTH_PX = 480,
  THUMB_SCALE = 0.5,
  TITLE_HEIGHT_PX = 30,
  ROW_LABEL_HEIGHT_PX = 24,
  QUALITY = 90;
const states = [
  'blank',
  'drawer',
  'picker',
  'brush',
  'width',
  'settings',
  'clear-drag',
  'coloring',
];
const [width, height] = id.split('/')[1].split('-').at(-1).split('x').map(Number);
const thumbWidth = Math.min(MAX_THUMB_WIDTH_PX, Math.round(width * THUMB_SCALE)),
  thumbHeight = Math.round((height * thumbWidth) / width),
  sheetWidth = thumbWidth * 3;
const dir = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web/evidence/visual', id),
  items = [];
function label(text, top, labelHeight) {
  items.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="white"/><text x="4" y="18" font-family="sans-serif" font-size="14" fill="black">${text}</text></svg>`
    ),
    left: 0,
    top,
  });
}
label(id + ' | shipping / RN / diff', 0, TITLE_HEIGHT_PX);
for (const [row, state] of states.entries()) {
  const top = TITLE_HEIGHT_PX + row * (thumbHeight + ROW_LABEL_HEIGHT_PX);
  label(state, top, ROW_LABEL_HEIGHT_PX);
  for (const [column, arm] of ['shipping', 'rn', 'diff'].entries())
    items.push({
      input: await sharp(`${dir}/${state}/${arm}.png`)
        .resize(thumbWidth, thumbHeight)
        .png()
        .toBuffer(),
      left: column * thumbWidth,
      top: top + ROW_LABEL_HEIGHT_PX,
    });
}
await sharp({
  create: {
    width: sheetWidth,
    height: TITLE_HEIGHT_PX + states.length * (thumbHeight + ROW_LABEL_HEIGHT_PX),
    channels: 3,
    background: 'white',
  },
})
  .composite(items)
  .jpeg({ quality: QUALITY })
  .toFile(`${dir}/review-sheet.jpg`);
console.log(`${dir}/review-sheet.jpg`);
