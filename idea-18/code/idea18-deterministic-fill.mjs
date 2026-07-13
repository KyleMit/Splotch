// IDEA 18 experiment (temporary — delete before finishing): deterministic fills.
// Segment the pen outline into closed regions, have a text/vision model assign
// palette colors per region, paint programmatically, punch, composite, gate.
//
// Usage (from repo root):
//   node tools/asset-gen/idea18-deterministic-fill.mjs segment shapes/circle-tall [--close N]
//   node tools/asset-gen/idea18-deterministic-fill.mjs plan    shapes/circle-tall
//   node tools/asset-gen/idea18-deterministic-fill.mjs paint   shapes/circle-tall
//   node tools/asset-gen/idea18-deterministic-fill.mjs compare shapes/circle-tall
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-18';
const WORK = join(IDEA_DIR, 'work');

const INK_LUMA = 150; // matches punch-fill OUTLINE_LUMA_THRESHOLD
const TINY_REGION_PX = 80; // smaller regions get bled over, not labeled
const PAPER_DARK = [0x21, 0x1f, 0x29];

// Curated palettes. Light = cheerful coloring-book flats on white paper.
// Night = deeper/jewel versions of the same hue families that pop on the dark
// board (#211f29) under a screened white chalk line.
const PALETTE = {
  'sky-blue': { light: '#aee3f7', night: '#1d5e86' },
  'ocean-blue': { light: '#7ec8e3', night: '#155e86' },
  'deep-blue': { light: '#5b9bd5', night: '#2b4a86' },
  navy: { light: '#4a6fa5', night: '#232f56' },
  teal: { light: '#7fd4c1', night: '#0f6f63' },
  seafoam: { light: '#bdeadf', night: '#2b7f6e' },
  'grass-green': { light: '#a5d6a7', night: '#2e7d32' },
  'leaf-green': { light: '#81c784', night: '#1e6b24' },
  'sunny-yellow': { light: '#ffe082', night: '#c99a17' },
  golden: { light: '#ffd54f', night: '#a97e0f' },
  cream: { light: '#fff3d6', night: '#b8a878' },
  orange: { light: '#ffb74d', night: '#c05f10' },
  coral: { light: '#ff8a65', night: '#b0421f' },
  red: { light: '#ef5350', night: '#8e1f1f' },
  'cherry-red': { light: '#e53935', night: '#7f1414' },
  'dusty-rose': { light: '#f4b8c1', night: '#8e4757' },
  pink: { light: '#f48fb1', night: '#a63a63' },
  bubblegum: { light: '#f8a8d8', night: '#993a78' },
  magenta: { light: '#e46bb7', night: '#7d2364' },
  lavender: { light: '#cfb6e8', night: '#5b3f85' },
  purple: { light: '#b39ddb', night: '#4a2f7d' },
  peach: { light: '#ffccaa', night: '#a55f33' },
  'skin-peach': { light: '#ffdbc2', night: '#a06a48' },
  tan: { light: '#e0c9a6', night: '#6f5636' },
  brown: { light: '#bc9367', night: '#54371c' },
  chocolate: { light: '#8d6e63', night: '#3e2a23' },
  gray: { light: '#cfd8dc', night: '#546e7a' },
  charcoal: { light: '#78909c', night: '#2c3a42' },
  black: { light: '#33333a', night: '#101014' },
  'white-tint': { light: '#f4f0ea', night: '#8d94a8' },
  'moon-silver': { light: '#e8e6f0', night: '#9aa2c4' },
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function loadInkMask(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ink = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < INK_LUMA) ink[p] = 1;
  }
  return { ink, w, h, rgb: data };
}

// Morphological close of the ink mask (dilate then erode by r) to seal gaps.
function closeInk(ink, w, h, r) {
  if (!r) return ink;
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && ink[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      dil[y * w + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let dy = -r; dy <= r && on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          on = 0;
          break;
        }
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !dil[yy * w + xx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

// 4-connected components of non-ink pixels. Returns Int32 label map (0 = ink,
// 1..n = regions) plus per-region stats.
function segment(ink, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const regions = [];
  let next = 1;
  for (let s = 0; s < w * h; s++) {
    if (ink[s] || labels[s]) continue;
    const id = next++;
    let sp = 0;
    stack[sp++] = s;
    labels[s] = id;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let touchesBorder = false;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      sx += x;
      sy += y;
      if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) touchesBorder = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const tryPush = (q) => {
        if (!ink[q] && !labels[q]) {
          labels[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    regions.push({
      id,
      area,
      cx: Math.round(sx / area),
      cy: Math.round(sy / area),
      touchesBorder,
      bbox: [minX, minY, maxX, maxY],
    });
  }
  return { labels, regions };
}

// Interior point of a region farthest from its boundary (chamfer distance),
// so number labels land inside even concave regions.
function labelPoints(labels, w, h, ids) {
  const want = new Set(ids);
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = labels[i] ? Infinity : 0;
  const pass = (x0, x1, dx, y0, y1, dy) => {
    for (let y = y0; y !== y1; y += dy) {
      for (let x = x0; x !== x1; x += dx) {
        const i = y * w + x;
        if (!d[i]) continue;
        let m = d[i];
        const nb = (xx, yy, c) => {
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
            const j = yy * w + xx;
            const v = (labels[j] === labels[i] ? d[j] : 0) + c;
            if (v < m) m = v;
          } else if (c < m) m = c;
        };
        nb(x - dx, y, 1);
        nb(x, y - dy, 1);
        nb(x - dx, y - dy, 1.414);
        nb(x + dx, y - dy, 1.414);
        d[i] = m;
      }
    }
  };
  pass(0, w, 1, 0, h, 1);
  pass(w - 1, -1, -1, h - 1, -1, -1);
  const best = new Map();
  for (let i = 0; i < d.length; i++) {
    const id = labels[i];
    if (!want.has(id)) continue;
    const cur = best.get(id);
    if (!cur || d[i] > cur.d) best.set(id, { d: d[i], x: i % w, y: (i / w) | 0 });
  }
  return best;
}

function distinctColor(i) {
  const hue = (i * 137.508) % 360;
  const s = 0.55;
  const l = 0.72;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const seq =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  return seq.map((v) => Math.round((v + m) * 255));
}

// Split fine regions that a coarse (heavily gap-closed) segmentation divides:
// a background that leaks through a deliberately open outline (circle-tall's
// ground mound) becomes two regions, while fine detail regions the coarse pass
// destroyed (eye whites, catchlights) keep their fine labels untouched.
const SPLIT_MIN_OVERLAP = 4000;
function refineByCoarse(fine, coarse, w, h) {
  const { labels, regions } = fine;
  const overlap = new Map();
  for (let p = 0; p < w * h; p++) {
    const f = labels[p];
    const c = coarse.labels[p];
    if (!f || !c) continue;
    let m = overlap.get(f);
    if (!m) overlap.set(f, (m = new Map()));
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  let next = regions.length + 1;
  const remap = new Map(); // fineId -> Map(coarseId -> newId)
  for (const r of regions) {
    // Only the background (border-touching) region may be split: interior
    // regions with narrow necks (hair strands) legitimately pinch off at the
    // coarse scale and must NOT be divided.
    if (!r.touchesBorder) continue;
    const m = overlap.get(r.id);
    if (!m) continue;
    const bigParts = [...m.entries()].filter(([, n]) => n >= SPLIT_MIN_OVERLAP);
    if (bigParts.length < 2) continue;
    const sub = new Map();
    for (const [cid] of bigParts) sub.set(cid, next++);
    remap.set(r.id, sub);
  }
  if (!remap.size) return fine;
  const out = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const f = labels[p];
    if (!f) continue;
    const sub = remap.get(f);
    if (!sub) {
      out[p] = f;
      continue;
    }
    out[p] = sub.get(coarse.labels[p]) ?? 0; // coarse-ink slivers stay unassigned -> bled
  }
  const stats = new Map();
  for (let p = 0; p < w * h; p++) {
    const id = out[p];
    if (!id) continue;
    const x = p % w;
    const y = (p / w) | 0;
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { id, area: 0, sx: 0, sy: 0, touchesBorder: false }));
    s.area++;
    s.sx += x;
    s.sy += y;
    if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) s.touchesBorder = true;
  }
  const newRegions = [...stats.values()]
    .map((s) => ({
      id: s.id,
      area: s.area,
      cx: Math.round(s.sx / s.area),
      cy: Math.round(s.sy / s.area),
      touchesBorder: s.touchesBorder,
    }))
    .sort((a, b) => a.id - b.id);
  return { labels: out, regions: newRegions };
}

const COARSE_CLOSE_R = 12;
async function segmentPage(page, closeR) {
  const [book, name] = page.split('/');
  const penPath = join(COLORING_DIR, book, `${name}.outline.webp`);
  const { ink: rawInk, w, h, rgb: penRgb } = await loadInkMask(penPath);
  const ink = closeInk(rawInk, w, h, closeR);
  // The page border counts as ink so subjects whose outline runs off the page
  // edge (a ground mound, a horizon) still enclose a region instead of merging
  // with the background.
  for (let x = 0; x < w; x++) {
    ink[x] = 1;
    ink[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    ink[y * w] = 1;
    ink[y * w + w - 1] = 1;
  }
  const fine = segment(ink, w, h);
  const coarseInk = closeInk(rawInk, w, h, COARSE_CLOSE_R);
  for (let x = 0; x < w; x++) {
    coarseInk[x] = 1;
    coarseInk[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    coarseInk[y * w] = 1;
    coarseInk[y * w + w - 1] = 1;
  }
  const { labels, regions } = refineByCoarse(fine, segment(coarseInk, w, h), w, h);
  const big = regions.filter((r) => r.area >= TINY_REGION_PX);
  const tiny = regions.filter((r) => r.area < TINY_REGION_PX);
  const background = big.filter((r) => r.touchesBorder).sort((a, b) => b.area - a.area);
  return { book, name, penPath, penRgb, ink, rawInk, w, h, labels, regions, big, tiny, background };
}

async function renderRegionMap(seg, outPath, { numbered = true } = {}) {
  const { labels, w, h, big, penRgb } = seg;
  const rgb = Buffer.alloc(w * h * 3, 255);
  const colorOf = new Map(big.map((r, i) => [r.id, distinctColor(i)]));
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const c = colorOf.get(labels[p]);
    if (c) {
      rgb[i] = c[0];
      rgb[i + 1] = c[1];
      rgb[i + 2] = c[2];
    } else if (!labels[p]) {
      rgb[i] = 40;
      rgb[i + 1] = 40;
      rgb[i + 2] = 40;
    } else {
      rgb[i] = penRgb[i];
      rgb[i + 1] = penRgb[i + 1];
      rgb[i + 2] = penRgb[i + 2];
    }
  }
  let img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } });
  if (numbered) {
    const pts = labelPoints(
      labels,
      w,
      h,
      big.map((r) => r.id)
    );
    const idx = new Map(big.map((r, i) => [r.id, i + 1]));
    const texts = [...pts.entries()]
      .map(([id, p]) => {
        const n = idx.get(id);
        const fs = Math.max(22, Math.min(44, p.d));
        return `<text x="${p.x}" y="${p.y}" font-size="${fs}" font-family="sans-serif" font-weight="bold" fill="#000" stroke="#fff" stroke-width="${fs / 7}" paint-order="stroke" text-anchor="middle" dominant-baseline="central">${n}</text>`;
      })
      .join('');
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${texts}</svg>`
    );
    img = sharp(await img.png().toBuffer()).composite([{ input: svg }]);
  }
  await img.png().toFile(outPath);
}

async function geminiPlan(seg, mapPath) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const paletteDesc = Object.entries(PALETTE)
    .map(([k, v]) => `${k} (light ${v.light}, night ${v.night})`)
    .join(', ');
  const regionDesc = seg.big
    .map((r, i) => {
      const pctArea = ((100 * r.area) / (seg.w * seg.h)).toFixed(1);
      const px = (r.cx / seg.w).toFixed(2);
      const py = (r.cy / seg.h).toFixed(2);
      return `#${i + 1}: area ${pctArea}% of page, center at (${px}, ${py})${r.touchesBorder ? ', touches page border' : ''}`;
    })
    .join('\n');
  const mapPng = await readFile(mapPath);
  const prompt = `This is a segmented coloring-book page ("${seg.name.replace(/-tall|-wide/, '')}" from the "${seg.book}" category of a toddler coloring app). Each closed region of the line art is tinted a random color and labeled with a number. The dark pixels are the line art itself.

Regions (normalized coordinates, (0,0)=top-left):
${regionDesc}

Assign every numbered region a color from this curated palette (use the NAME only): ${paletteDesc}.

Rules:
- The tint colors in the image are RANDOM segmentation labels — they carry NO color information. Do NOT let a region's tint influence your choice; judge only from the line art, shape, position, and what the region depicts.
- Human/humanoid skin (face, arms, torso of a person, mermaid, etc.) must be "skin-peach".
- Identify what each region depicts (background, a body part, an object part) from the picture and its position/size, then choose a natural, cheerful coloring-book color for it.
- The SAME palette name is used for both light and night themes (the palette provides matched light/night hexes), so pick the name for the subject, not the theme.
- Large border-touching regions are background/sky: give them a soft, plausible scene color.
- Neighboring regions that are parts of the same surface should share a color; adjacent different parts should contrast.
- Eyes: a pupil region should be "black"; a tiny catchlight/highlight region inside or beside a pupil should be "white-tint"; eye whites (sclera) "white-tint".
- Respond with STRICT JSON only, no markdown fences: {"regions": [{"n": 1, "what": "short label", "color": "palette-name"}, ...]} covering every region number exactly once.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: mapPng.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
    config: { abortSignal: AbortSignal.timeout(120_000), responseMimeType: 'application/json' },
  });
  const text =
    response.text ?? response.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
  const parsed = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
  return parsed.regions;
}

// Direction-neutral inward bleed, same algorithm as lib/punch-fill.mjs.
function bleed(rgb, mask, w, h) {
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < w * h; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % w;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || pending[q]) continue;
        r += rgb[q * 3];
        g += rgb[q * 3 + 1];
        b += rgb[q * 3 + 2];
        n++;
      }
      if (!n) {
        next.push(p);
        continue;
      }
      rgb[p * 3] = Math.round(r / n);
      rgb[p * 3 + 1] = Math.round(g / n);
      rgb[p * 3 + 2] = Math.round(b / n);
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
}

async function paintPage(seg, plan, theme) {
  const { labels, w, h, big } = seg;
  const colorOf = new Map();
  for (const item of plan) {
    const region = big[item.n - 1];
    if (!region || !PALETTE[item.color]) continue;
    colorOf.set(region.id, hexToRgb(PALETTE[item.color][theme]));
  }
  const rgb = Buffer.alloc(w * h * 3, 255);
  const mask = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const c = colorOf.get(labels[p]);
    if (c) {
      rgb[i] = c[0];
      rgb[i + 1] = c[1];
      rgb[i + 2] = c[2];
    } else {
      mask[p] = 1; // ink, tiny region, or unassigned — bled over
    }
  }
  // Punch mask per theme: pen for light, chalk for night (pipeline behavior).
  const linePath =
    theme === 'night' ? join(COLORING_DIR, seg.book, `${seg.name}.chalk.webp`) : seg.penPath;
  const { ink: lineInk } = await loadInkMask(linePath);
  for (let p = 0; p < w * h; p++) if (lineInk[p]) mask[p] = 1;
  bleed(rgb, mask, w, h);
  return { fill: rgb, lineInk, linePath };
}

const [, , cmd, page, ...rest] = process.argv;
const closeR = rest.includes('--close') ? parseInt(rest[rest.indexOf('--close') + 1], 10) : 0;
await mkdir(WORK, { recursive: true });
const slug = page ? page.replace('/', '-') : '';

if (cmd === 'segment') {
  const seg = await segmentPage(page, closeR);
  console.log(`page=${page} close=${closeR} size=${seg.w}x${seg.h}`);
  console.log(
    `regions total=${seg.regions.length} big(>=${TINY_REGION_PX}px)=${seg.big.length} tiny=${seg.tiny.length}`
  );
  console.log(`background candidates (border-touching big): ${seg.background.length}`);
  for (const r of seg.big
    .slice()
    .sort((a, b) => b.area - a.area)
    .slice(0, 15)) {
    console.log(
      `  region ${r.id}: area=${r.area} (${((100 * r.area) / (seg.w * seg.h)).toFixed(1)}%) center=(${r.cx},${r.cy}) border=${r.touchesBorder}`
    );
  }
  await renderRegionMap(seg, join(WORK, `${slug}-regions-close${closeR}.png`));
  console.log(`map -> ${join(WORK, `${slug}-regions-close${closeR}.png`)}`);
} else if (cmd === 'plan') {
  const seg = await segmentPage(page, closeR);
  const mapPath = join(WORK, `${slug}-regions-close${closeR}.png`);
  await renderRegionMap(seg, mapPath);
  const plan = await geminiPlan(seg, mapPath);
  await writeFile(join(WORK, `${slug}-plan.json`), JSON.stringify({ closeR, plan }, null, 2));
  for (const item of plan) console.log(`#${item.n} ${item.what} -> ${item.color}`);
} else if (cmd === 'paint') {
  const seg = await segmentPage(page, closeR);
  const { plan } = JSON.parse(await readFile(join(WORK, `${slug}-plan.json`), 'utf8'));
  for (const theme of ['light', 'night']) {
    const { fill, lineInk } = await paintPage(seg, plan, theme);
    const { w, h } = seg;
    await sharp(fill, { raw: { width: w, height: h, channels: 3 } })
      .webp({ quality: 90 })
      .toFile(join(WORK, `${slug}.${theme}.det.webp`));
    //

    // Raw-equivalent (fills + line art kept) for the registration gate.
    const raw = Buffer.from(fill);
    const { rgb: lineRgb } = await loadInkMask(
      theme === 'night' ? join(COLORING_DIR, seg.book, `${seg.name}.chalk.webp`) : seg.penPath
    );
    for (let p = 0, i = 0; p < w * h; p++, i += 3) {
      if (lineInk[p]) {
        raw[i] = lineRgb[i];
        raw[i + 1] = lineRgb[i + 1];
        raw[i + 2] = lineRgb[i + 2];
      }
    }
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .webp({ quality: 90 })
      .toFile(join(WORK, `${slug}.${theme}.det.raw.webp`));
  }
  console.log('painted', slug);
} else if (cmd === 'compare') {
  const seg = await segmentPage(page, closeR);
  const { w, h } = seg;
  const pen = await readFile(seg.penPath);
  const chalkPath = join(COLORING_DIR, seg.book, `${seg.name}.chalk.webp`);
  const chalk = await readFile(chalkPath);
  const LONG = 560;
  const resize = (img) => img.resize({ width: w > h ? LONG : null, height: h >= w ? LONG : null });

  const multiply = async (fillBuf) => {
    const { data: f } = await sharp(fillBuf)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: l } = await sharp(pen)
      .removeAlpha()
      .resize(w, h, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(w * h * 3);
    for (let i = 0; i < out.length; i++) out[i] = (f[i] * l[i]) / 255;
    return sharp(out, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();
  };

  const jobs = [
    [
      'shipped-light',
      await multiply(await readFile(join(COLORING_DIR, seg.book, `${seg.name}.light.webp`))),
    ],
    ['det-light', await multiply(await readFile(join(WORK, `${slug}.light.det.webp`)))],
    [
      'shipped-night',
      await compositeNight(
        await readFile(join(COLORING_DIR, seg.book, `${seg.name}.night.webp`)),
        chalk
      ),
    ],
    [
      'det-night',
      await compositeNight(await readFile(join(WORK, `${slug}.night.det.webp`)), chalk),
    ],
  ];
  for (const [label, buf] of jobs) {
    await resize(sharp(buf))
      .webp({ quality: 85 })
      .toFile(join(IDEA_DIR, `${slug}-${label}.webp`));
  }
  await resize(sharp(join(WORK, `${slug}-regions-close${closeR}.png`)))
    .webp({ quality: 85 })
    .toFile(join(IDEA_DIR, `${slug}-regions.webp`));

  // Gates: outline registration of the deterministic raws.
  for (const theme of ['light', 'night']) {
    const srcBuf = theme === 'night' ? chalk : pen;
    const rawBuf = await readFile(join(WORK, `${slug}.${theme}.det.raw.webp`));
    const m = await outlineMatch(srcBuf, rawBuf);
    console.log(
      `${theme}: keep=${(m.keep * 100).toFixed(1)}% (bar ${KEEP_THRESHOLD * 100}) localKeep=${(m.localKeep * 100).toFixed(1)}% (bar ${LOCAL_KEEP_THRESHOLD * 100})`
    );
  }
} else {
  console.error('unknown command');
  process.exit(1);
}
