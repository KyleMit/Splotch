// Idea #17: caption-bar montage builder. args: <out> <cols> <file|caption> ...
import sharp from 'sharp';

const [out, colsArg, ...specs] = process.argv.slice(2);
const cols = Number(colsArg);
const tiles = specs.map((s) => {
  const i = s.indexOf('|');
  return { file: s.slice(0, i), caption: s.slice(i + 1) };
});
const rows = Math.ceil(tiles.length / cols);
const GAP = 4;
const CAP_H = 30;
const TOTAL_W = 560;
const tileW = Math.floor((TOTAL_W - GAP * (cols - 1)) / cols);
const meta = await sharp(tiles[0].file).metadata();
const tileH = Math.round((tileW * meta.height) / meta.width);
const cellH = tileH + CAP_H;
const H = rows * cellH + GAP * (rows - 1);
const composites = [];
for (let i = 0; i < tiles.length; i++) {
  const x = (i % cols) * (tileW + GAP);
  const y = Math.floor(i / cols) * (cellH + GAP);
  composites.push({
    input: await sharp(tiles[i].file).resize(tileW, tileH, { fit: 'fill' }).png().toBuffer(),
    left: x,
    top: y,
  });
  const svg = `<svg width="${tileW}" height="${CAP_H}"><rect width="100%" height="100%" fill="#111"/><text x="${tileW / 2}" y="${CAP_H / 2 + 4}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="11" fill="#eee">${tiles[i].caption}</text></svg>`;
  composites.push({ input: Buffer.from(svg), left: x, top: y + tileH });
}
await sharp({
  create: { width: TOTAL_W, height: H, channels: 3, background: '#333' },
})
  .composite(composites)
  .webp({ quality: 88 })
  .toFile(out);
console.log('wrote', out);
