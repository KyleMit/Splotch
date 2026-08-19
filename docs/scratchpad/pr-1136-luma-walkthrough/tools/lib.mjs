import sharp from 'sharp';

export const luma601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export async function rgb(buf, w, h) {
  let p = sharp(buf).removeAlpha();
  if (w) p = p.resize(w, h, { fit: 'fill' });
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

export async function vipsGray(buf, w, h) {
  let p = sharp(buf).removeAlpha();
  if (w) p = p.resize(w, h, { fit: 'fill' });
  const { data, info } = await p.grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// mask (Uint8Array 0/1) -> png buffer, painted `color` on `bg`
export async function maskPng(mask, w, h, color = [17, 17, 17], bg = [255, 255, 255]) {
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const c = mask[p] ? color : bg;
    out[p * 3] = c[0];
    out[p * 3 + 1] = c[1];
    out[p * 3 + 2] = c[2];
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

export async function rawPng(data, w, h, channels = 3) {
  return sharp(data, { raw: { width: w, height: h, channels } })
    .png()
    .toBuffer();
}

export async function dataUri(pngBuf) {
  return 'data:image/png;base64,' + pngBuf.toString('base64');
}

export async function svgToPng(svg, outPath) {
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(outPath);
}

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
