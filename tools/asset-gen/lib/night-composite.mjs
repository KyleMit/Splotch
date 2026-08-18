// Simulate the FINAL dark-mode render of a night fill under its chalk outline:
// the fill punched with the chalk (transparent where the chalk has ink) over
// the dark paper, with the chalk's negation screened on top — mirroring
// lib/punch-fill.mjs plus the app's dark --lineart-* treatment. Post pen/chalk
// fork (docs/pen-chalk-fork.md) the chalk owns the eye whites, so any judgment about what a
// child actually SEES at night (the eye gates in gen-night-fills.mjs
// and check-fill-eyes.mjs) must run on this composite, not the raw fill.
import sharp from 'sharp';
import { OUTLINE_LUMA_THRESHOLD } from './punch-fill.mjs';

const PAPER_DARK = [0x21, 0x1f, 0x29]; // app.css --paper (dark)

export async function compositeNight(fillBuf, chalkBuf) {
  const {
    data: fill,
    info: { width, height },
  } = await sharp(fillBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // OUTLINE_LUMA_THRESHOLD and composite-eye fixture expectations are calibrated
  // under libvips grayscale weighting. Unifying this conversion with image-stats
  // luma requires rebuilding the fixtures and re-freezing the coloring goldens.
  const { data: ink } = await sharp(chalkBuf)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 3);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const punched = ink[p] < OUTLINE_LUMA_THRESHOLD;
    const chalkWhite = 255 - ink[p];
    for (let c = 0; c < 3; c++) {
      const base = punched ? PAPER_DARK[c] : fill[i + c];
      out[i + c] = 255 - ((255 - base) * (255 - chalkWhite)) / 255;
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}
