// Stitch reference + my renders into side-by-side strips (one per scene) for a
// by-eye final call and for the PR. Usage: node scripts/crayon/contact.mjs waxy light
import sharp from 'sharp';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = process.env.CRAYON_OUT || join(tmpdir(), 'splotch-crayon');
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['waxy'];
const H = 420;
const GAP = 16;
const scenes = [
  ['single', 'single'],
  ['overlap', 'buildup'],
  ['scribble', 'scribble'],
];

async function label(text, w) {
  const svg = `<svg width="${w}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-family="sans-serif" font-size="16" fill="#fff">${text}</text></svg>`;
  return Buffer.from(svg);
}

async function tile(path, caption) {
  const img = sharp(path).resize({ height: H, fit: 'contain', background: '#fcfbf8' });
  const buf = await img.png().toBuffer();
  const { width } = await sharp(buf).metadata();
  return sharp(buf)
    .extend({ top: 28, bottom: 0, left: 0, right: 0, background: '#111' })
    .composite([{ input: await label(caption, width), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

for (const [refName, mineName] of scenes) {
  const tiles = [await tile(join(DIR, 'refs', `${refName}.png`), `REAL: ${refName}`)];
  for (const v of variants)
    tiles.push(await tile(join(DIR, `mine-${v}-${mineName}.png`), `mine: ${v}`));
  const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
  const totalW = metas.reduce((s, m) => s + m.width, 0) + GAP * (tiles.length - 1);
  const maxH = Math.max(...metas.map((m) => m.height));
  let x = 0;
  const composite = [];
  for (let i = 0; i < tiles.length; i++) {
    composite.push({ input: tiles[i], top: 0, left: x });
    x += metas[i].width + GAP;
  }
  const out = join(DIR, `contact-${refName}.png`);
  await sharp({ create: { width: totalW, height: maxH, channels: 3, background: '#333' } })
    .composite(composite)
    .png()
    .toFile(out);
  console.log('wrote', out);
}
