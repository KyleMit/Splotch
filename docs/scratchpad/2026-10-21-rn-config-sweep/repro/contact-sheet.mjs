import sharp from 'sharp';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const files = readdirSync(dir).filter(
  (x) => x.endsWith('.png') && !x.includes('sheet') && !x.includes('undo') && !x.includes('before')
);
const width = 250,
  height = 420,
  cols = 5;
const tiles = [];
for (let i = 0; i < files.length; i++) {
  const left = (i % cols) * width,
    top = Math.floor(i / cols) * height;
  tiles.push({
    input: await sharp(path.join(dir, files[i]))
      .resize({ width, height: height - 25, fit: 'contain', background: '#ddd' })
      .png()
      .toBuffer(),
    left,
    top: top + 25,
  });
  tiles.push({
    input: Buffer.from(
      `<svg width="${width}" height="25"><rect width="100%" height="100%" fill="white"/><text x="3" y="17" font-size="12">${files[i]}</text></svg>`
    ),
    left,
    top,
  });
}
await sharp({
  create: {
    width: cols * width,
    height: Math.ceil(files.length / cols) * height,
    channels: 3,
    background: '#aaa',
  },
})
  .composite(tiles)
  .png()
  .toFile(path.join(dir, 'sheet.png'));
console.log(files.length + ' frames');
