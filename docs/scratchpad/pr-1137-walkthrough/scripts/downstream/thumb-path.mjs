import sharp from 'sharp';
const page = 'web/static/coloring/creatures/unicorn-tall.outline.webp';
const src = await sharp(page).png().toBuffer();
async function thumb(buf, q) {
  return sharp(buf)
    .resize(240, 240, { fit: 'inside', kernel: 'lanczos3' })
    .webp({ quality: q })
    .toBuffer();
}
async function raw(b) {
  return await sharp(b).grayscale().raw().toBuffer();
}
const ref = await raw(await thumb(src, 100));
console.log('outline stored at -> picker thumb (240px, q80): mean abs difference vs a q100 thumb');
for (const q of [75, 90, 92, 95, 98]) {
  const enc = await sharp(src).webp({ quality: q }).toBuffer();
  const t = await raw(await thumb(enc, 80));
  let s = 0;
  for (let i = 0; i < t.length; i++) s += Math.abs(t[i] - ref[i]);
  console.log(
    `  outline q${String(q).padEnd(4)} -> thumb differs by ${(s / t.length).toFixed(3)} /255`
  );
}
// How much of that is the thumb's own q80, independent of the outline?
const t100 = await raw(await thumb(src, 100));
const t80 = await raw(await thumb(src, 80));
let s = 0;
for (let i = 0; i < t80.length; i++) s += Math.abs(t80[i] - t100[i]);
console.log(
  `\n  thumb q80 vs q100 from the SAME outline: ${(s / t80.length).toFixed(3)} /255  <- the tile's own encode`
);
