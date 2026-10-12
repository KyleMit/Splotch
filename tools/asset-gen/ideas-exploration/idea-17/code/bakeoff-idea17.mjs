// Idea #17 bake-off rescore harness — offline, no API calls.
// Scores an arbitrary night-fill take or chalk candidate with the SAME gates the
// generators use, so shipped baselines and saved model takes land on one scorecard.
//
//   node bakeoff-idea17.mjs night <page-rel> <fill-file>   e.g. night vehicles/train-wide fill-src/.../train-wide.night.raw.webp
//   node bakeoff-idea17.mjs chalk <page-rel> <chalk-file>  e.g. chalk shapes/rectangle-wide web/static/coloring/shapes/rectangle-wide.chalk.webp
//
// The drift/nightness/line-color scorers are verbatim copies of the file-local
// functions in gen-coloring-fills-dark.mjs; the new-ink scorer copies
// gen-coloring-chalk.mjs. Gates and thresholds identical to the generators.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { dilateMask, erodeMask } from './lib/morphology.mjs';
import { compositeNight } from './lib/night-composite.mjs';
import { scoreEyeFill, judgeNightEyes, EYE_DARK_MAX, EYE_LIGHT_MIN } from './lib/eye-fill.mjs';
import { outlineMatch } from './lib/outline-match.mjs';

const DRIFT_W = 512;
const DRIFT_SRC_DARK = 110;
const DRIFT_DILATE = 6;
const DRIFT_THIN = 3;
const DRIFT_LUMA_WHITE = 185;
const DRIFT_CHROMA_MAX = 45;
const NIGHT_W = 384;
const NIGHT_SRC_LIGHT = 170;
const NIGHT_MIN_BG_FRAC = 0.04;
const LINE_W = 512;
const LINE_SRC_DARK = 110;

async function scoreNightness(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && s.data[i] > NIGHT_SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  if (lumas.length < n * NIGHT_MIN_BG_FRAC) return { bgLuma: 0, bgFrac: lumas.length / n };
  lumas.sort((a, b) => a - b);
  return { bgLuma: lumas[lumas.length >> 1], bgFrac: lumas.length / n };
}

async function scoreDrift(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const outline = new Uint8Array(n);
  let srcCount = 0;
  for (let i = 0; i < n; i++) {
    if (s.data[i] < DRIFT_SRC_DARK) {
      outline[i] = 1;
      srcCount++;
    }
  }
  const allowed = dilateMask(outline, w, h, DRIFT_DILATE);
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w, h, DRIFT_THIN), w, h, DRIFT_THIN);
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (white[i] && !blobs[i] && !allowed[i]) added++;
  }
  return { ratio: srcCount ? added / srcCount : 0, added, srcCount };
}

async function scoreLineColor(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= LINE_SRC_DARK) continue;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = t.data[yy * w + xx];
          if (v > mx) mx = v;
        }
      }
      maxes.push(mx);
    }
  }
  if (!maxes.length) return { lineWhite: 255 };
  maxes.sort((a, b) => a - b);
  return { lineWhite: maxes[maxes.length >> 1] };
}

const INK_W = 512;
const INK_DARK = 110;
const PEN_SLACK = 2;
const BG_SLACK = 4;

async function inkMask(buf) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(INK_W, INK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(INK_W * INK_W);
  for (let i = 0; i < data.length; i++) mask[i] = data[i] < INK_DARK ? 1 : 0;
  return mask;
}

function openBackground(penMask) {
  const w = INK_W;
  const h = INK_W;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && !penMask[i]) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    push((i % w) + 1, (i / w) | 0);
    push((i % w) - 1, (i / w) | 0);
    push(i % w, ((i / w) | 0) + 1);
    push(i % w, ((i / w) | 0) - 1);
  }
  return bg;
}

async function scoreNewInk(penBuf, candidateBuf) {
  const pen = await inkMask(penBuf);
  const cand = await inkMask(candidateBuf);
  const n = INK_W * INK_W;
  const allowed = dilateMask(pen, INK_W, INK_W, PEN_SLACK);
  const bgSafe = dilateMask(pen, INK_W, INK_W, BG_SLACK);
  const bg = openBackground(pen);
  let penMass = 0;
  let invented = 0;
  let whitened = 0;
  for (let i = 0; i < n; i++) {
    if (pen[i]) penMass++;
    if (!cand[i] || allowed[i]) continue;
    if (bg[i]) {
      if (!bgSafe[i]) invented++;
    } else {
      whitened++;
    }
  }
  return {
    inventedRatio: penMass ? invented / penMass : 0,
    whiteFrac: whitened / n,
  };
}

function judgeChalkEyes(chalkScored, lightScored) {
  let pupilsInked = 0;
  let whitesMissed = 0;
  for (let i = 0; i < lightScored.cores.length; i++) {
    const ref = lightScored.cores[i];
    const chalkCore = chalkScored.cores[i];
    if (!ref || !chalkCore) continue;
    if (ref.coreLuma <= EYE_DARK_MAX && chalkCore.coreLuma < EYE_LIGHT_MIN) pupilsInked++;
    if (ref.coreLuma >= 180 && chalkCore.coreLuma > EYE_DARK_MAX) whitesMissed++;
  }
  return { pupilsInked, whitesMissed };
}

const [mode, rel, file] = process.argv.slice(2);
if (!mode || !rel || !file) {
  console.error('usage: bakeoff-idea17.mjs <night|chalk> <page-rel> <candidate-file>');
  process.exit(1);
}
const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
const candidate = await readFile(file);
const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
const lightEyes = existsSync(lightRawPath)
  ? await scoreEyeFill(await readFile(lightRawPath), pen)
  : null;

if (mode === 'night') {
  const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
  const chalk = existsSync(chalkPath) ? await readFile(chalkPath) : null;
  const source = chalk ?? pen;
  const drift = await scoreDrift(candidate, source);
  const night = await scoreNightness(candidate, source);
  const line = await scoreLineColor(candidate, source);
  const eyes = lightEyes
    ? judgeNightEyes(
        await scoreEyeFill(chalk ? await compositeNight(candidate, chalk) : candidate, pen),
        lightEyes
      )
    : { passes: true, failed: 0 };
  console.log(
    JSON.stringify(
      {
        rel,
        file,
        drift: +drift.ratio.toFixed(4),
        bgLuma: +night.bgLuma.toFixed(0),
        lineW: +line.lineWhite.toFixed(0),
        eyesPass: eyes.passes,
        eyesFailed: eyes.failed,
      },
      null,
      2
    )
  );
} else if (mode === 'chalk') {
  const fwd = await outlineMatch(pen, candidate);
  const newInk = await scoreNewInk(pen, candidate);
  const eyes = lightEyes
    ? judgeChalkEyes(await scoreEyeFill(candidate, pen), lightEyes)
    : { pupilsInked: 0, whitesMissed: 0 };
  console.log(
    JSON.stringify(
      {
        rel,
        file,
        keep: +(fwd.keep * 100).toFixed(1),
        localKeep: +(fwd.localKeep * 100).toFixed(1),
        whiteFrac: +(newInk.whiteFrac * 100).toFixed(2),
        inventedRatio: +newInk.inventedRatio.toFixed(4),
        ...eyes,
      },
      null,
      2
    )
  );
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(1);
}
