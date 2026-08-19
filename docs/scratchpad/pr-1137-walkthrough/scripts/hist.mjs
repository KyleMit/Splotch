import sharp from 'sharp';
const files = process.argv.slice(2);
for (const f of files) {
  const { data, info } = await sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true });
  const h = new Array(256).fill(0);
  for (const v of data) h[v]++;
  const n = data.length;
  const black = h.slice(0, 8).reduce((a, b) => a + b, 0);
  const white = h.slice(248).reduce((a, b) => a + b, 0);
  const mid = n - black - white;
  console.log(`${f}\n  ${info.width}x${info.height}  near-black ${(black/n*100).toFixed(1)}%  near-white ${(white/n*100).toFixed(1)}%  midtone ${(mid/n*100).toFixed(1)}%`);
}
