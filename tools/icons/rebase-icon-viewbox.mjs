// Rebases every icon in web/src/lib/icons/ onto the canonical square
// `viewBox="0 0 1000 1000"` (iconViewBox.test.ts enforces it) by baking the
// uniform scale + translate into the coordinate data itself — path commands,
// circle/ellipse/rect geometry, <use> stamp offsets, userSpaceOnUse gradient
// vectors — so each file stays a natively aligned asset rather than original
// artwork re-framed through a shifted viewBox window. A non-square source
// rect is centered in the square box, which is exactly where xMidYMid
// letterboxing already painted it, so rendering is unchanged.
//
//   node tools/icons/rebase-icon-viewbox.mjs [<icon-name> ...]
//
// With no names, rebases every non-canonical icon. Every write is verified by
// rasterizing the rebased file against the original at 512px and refusing to
// write when more than antialiasing rounding differs.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, isMain } from '../lib/proc.mjs';
import { roundCoordinate, transformPathData } from './lib/svg-path-transform.mjs';

const ICON_DIR = join(ROOT, 'web/src/lib/icons');
const CANONICAL_SIDE = 1000;
const CANONICAL_VIEWBOX = `0 0 ${CANONICAL_SIDE} ${CANONICAL_SIDE}`;

// The mascot is not an <Icon> asset (NON_RENDERABLE_ICONS): it renders via a
// Vite URL import where the file's own frame is the source of truth.
const REBASE_EXEMPT = new Set(['splotchy.svg']);

const DIFF_SIZE = 512;
// Rebasing only re-expresses coordinates, so any real mistake moves whole
// shapes and dwarfs this: the allowance is for antialiasing re-rounding.
const MAX_BAD_PIXEL_FRACTION = 0.003;
const CHANNEL_TOLERANCE = 24;

const num = (v) => String(roundCoordinate(v));

// Anchored on the preceding boundary so `d=` can never match inside `id=`.
function setAttr(tag, name, value) {
  const re = new RegExp(`(^|\\s)${name}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, `$1${name}="${value}"`);
  return tag.replace(/\/?>$/, (end) => ` ${name}="${value}"${end}`);
}

function getAttr(tag, name) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function rotatePoint(x, y, deg, cx, cy) {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

const ROTATE_RE = /^rotate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/;
const TRANSLATE_SCALE_RE =
  /^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)\s*scale\(\s*(-?[\d.]+)\s*\)$/;

// An element positioned by `rotate(a cx cy)` around a far center keeps its
// orientation under a uniform scale, so it re-emits rotated about its own
// mapped center: geometry recentered on p' = G(R(a,c)(localCenter)),
// transform rewritten to rotate(a p'x p'y).
function mapRotatedCenter(transform, localCx, localCy, s, tx, ty) {
  const m = transform.match(ROTATE_RE);
  if (!m) return null;
  const [deg, rcx, rcy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [fx, fy] = rotatePoint(localCx, localCy, deg, rcx, rcy);
  return { deg, px: roundCoordinate(s * fx + tx), py: roundCoordinate(s * fy + ty) };
}

// Stroke width and dash lengths are user-space values on elements whose
// coordinates get baked, so they scale with them. Elements repositioned via a
// kept transform (the translate·scale fold) keep local stroke values — the
// composed transform scales those. non-scaling-stroke strokes are screen-space.
function scaleStrokeProps(tag, s) {
  if (tag.includes('non-scaling-stroke')) return tag;
  const scaleList = (v) =>
    v
      .trim()
      .split(/[\s,]+/)
      .map((n) => num(s * Number(n)))
      .join(' ');
  return tag
    .replace(
      /(^|\s)stroke-width="([^"]*)"/,
      (m, p, v) => `${p}stroke-width="${num(s * Number(v))}"`
    )
    .replace(/stroke-width:\s*([0-9.]+)/, (m, v) => `stroke-width:${num(s * Number(v))}`)
    .replace(
      /(^|\s)stroke-dasharray="([^"]*)"/,
      (m, p, v) => `${p}stroke-dasharray="${scaleList(v)}"`
    )
    .replace(/stroke-dasharray:\s*([0-9. ,]+)/, (m, v) => `stroke-dasharray:${scaleList(v)}`);
}

const GEOMETRY_ELEMENTS = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'];

// Every element name the transform pass knows how to leave correct. Anything
// outside this set can carry coordinates the pass never visits (<text>,
// <image>, <clipPath>, a nested <svg>…), and small enough artwork slips under
// the pixel gate — so an unknown element fails the rebase loudly (ADR-0125)
// instead of trusting the threshold.
const KNOWN_ELEMENTS = new Set([
  'svg',
  'defs',
  'title',
  'desc',
  'g',
  'stop',
  'use',
  'linearGradient',
  'radialGradient',
  ...GEOMETRY_ELEMENTS,
]);

function transformSvg(svg, s, tx, ty) {
  const unhandled = [];
  for (const m of svg.matchAll(/<([A-Za-z][\w:-]*)[\s/>]/g)) {
    if (!KNOWN_ELEMENTS.has(m[1])) unhandled.push(`unsupported element <${m[1]}>`);
  }
  const defsStart = svg.indexOf('<defs>');
  const defsEnd = defsStart === -1 ? -1 : svg.indexOf('</defs>', defsStart);
  const inDefs = (offset) => defsStart !== -1 && offset > defsStart && offset < defsEnd;

  const out = svg.replace(
    /<(path|circle|ellipse|rect|line|polyline|polygon|use|linearGradient|radialGradient|g)\b[^>]*\/?>/g,
    (rawTag, el, offset) => {
      const transform = getAttr(rawTag, 'transform');
      // Geometry inside <defs> is stamped through <use>, whose x/y offsets
      // receive the full transform — the def content itself only scales
      // (T(t)S(s)·T(x,y) = T(t+s·x, t+s·y)·S(s)).
      const defScaleOnly = inDefs(offset) && GEOMETRY_ELEMENTS.includes(el);
      const etx = defScaleOnly ? 0 : tx;
      const ety = defScaleOnly ? 0 : ty;
      const bakesCoordinates =
        GEOMETRY_ELEMENTS.includes(el) && (!transform || el === 'ellipse' || el === 'rect');
      const tag = bakesCoordinates ? scaleStrokeProps(rawTag, s) : rawTag;

      if (el === 'path') {
        if (transform) {
          const ts = transform.match(TRANSLATE_SCALE_RE);
          if (!ts) {
            unhandled.push(`path transform: ${transform}`);
            return tag;
          }
          // T(t)S(s)·T(e)S(k) = T(t+s·e)S(s·k); the path data stays local.
          // A composed scale factor multiplies every local coordinate, so it
          // keeps more precision than baked coordinates need — 2dp here drifts
          // dash edges a visible fraction of a pixel at the far end of a path.
          const num5 = (v) => String(Math.round(v * 100000) / 100000);
          const [ex, ey, k] = [Number(ts[1]), Number(ts[2]), Number(ts[3])];
          return setAttr(
            tag,
            'transform',
            `translate(${num5(etx + s * ex)} ${num5(ety + s * ey)})scale(${num5(s * k)})`
          );
        }
        return setAttr(
          tag,
          'd',
          transformPathData(getAttr(tag, 'd'), { scale: s, translateX: etx, translateY: ety })
        );
      }
      if (el === 'circle') {
        if (transform) {
          unhandled.push(`circle transform: ${transform}`);
          return tag;
        }
        let t = setAttr(tag, 'cx', num(s * Number(getAttr(tag, 'cx') ?? 0) + etx));
        t = setAttr(t, 'cy', num(s * Number(getAttr(tag, 'cy') ?? 0) + ety));
        return setAttr(t, 'r', num(s * Number(getAttr(tag, 'r'))));
      }
      if (el === 'ellipse') {
        const cx = Number(getAttr(tag, 'cx') ?? 0);
        const cy = Number(getAttr(tag, 'cy') ?? 0);
        let t = tag;
        if (transform) {
          const mapped = mapRotatedCenter(transform, cx, cy, s, etx, ety);
          if (!mapped) {
            unhandled.push(`ellipse transform: ${transform}`);
            return tag;
          }
          t = setAttr(t, 'transform', `rotate(${num(mapped.deg)} ${mapped.px} ${mapped.py})`);
          t = setAttr(t, 'cx', String(mapped.px));
          t = setAttr(t, 'cy', String(mapped.py));
        } else {
          t = setAttr(t, 'cx', num(s * cx + etx));
          t = setAttr(t, 'cy', num(s * cy + ety));
        }
        t = setAttr(t, 'rx', num(s * Number(getAttr(tag, 'rx'))));
        return setAttr(t, 'ry', num(s * Number(getAttr(tag, 'ry'))));
      }
      if (el === 'rect') {
        const w = Number(getAttr(tag, 'width'));
        const h = Number(getAttr(tag, 'height'));
        const x = Number(getAttr(tag, 'x') ?? 0);
        const y = Number(getAttr(tag, 'y') ?? 0);
        let t = setAttr(tag, 'width', num(s * w));
        t = setAttr(t, 'height', num(s * h));
        for (const dim of ['rx', 'ry']) {
          const v = getAttr(t, dim);
          if (v != null) t = setAttr(t, dim, num(s * Number(v)));
        }
        if (transform) {
          const mapped = mapRotatedCenter(transform, x + w / 2, y + h / 2, s, etx, ety);
          if (!mapped) {
            unhandled.push(`rect transform: ${transform}`);
            return tag;
          }
          t = setAttr(t, 'transform', `rotate(${num(mapped.deg)} ${mapped.px} ${mapped.py})`);
          t = setAttr(t, 'x', num(mapped.px - (s * w) / 2));
          return setAttr(t, 'y', num(mapped.py - (s * h) / 2));
        }
        t = setAttr(t, 'x', num(s * x + etx));
        return setAttr(t, 'y', num(s * y + ety));
      }
      if (el === 'line') {
        if (transform) {
          unhandled.push(`line transform: ${transform}`);
          return tag;
        }
        let t = tag;
        for (const [attr, off] of [
          ['x1', etx],
          ['y1', ety],
          ['x2', etx],
          ['y2', ety],
        ]) {
          t = setAttr(t, attr, num(s * Number(getAttr(t, attr) ?? 0) + off));
        }
        return t;
      }
      if (el === 'polyline' || el === 'polygon') {
        if (transform) {
          unhandled.push(`${el} transform: ${transform}`);
          return tag;
        }
        const points = getAttr(tag, 'points');
        const nums = (points ?? '')
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number);
        if (!nums.length || nums.length % 2 || nums.some(Number.isNaN)) {
          unhandled.push(`unparseable points on <${el}>: ${points}`);
          return tag;
        }
        const mapped = [];
        for (let i = 0; i < nums.length; i += 2) {
          mapped.push(`${num(s * nums[i] + etx)},${num(s * nums[i + 1] + ety)}`);
        }
        return setAttr(tag, 'points', mapped.join(' '));
      }
      if (el === 'use') {
        if (transform) {
          unhandled.push(`use transform: ${transform}`);
          return tag;
        }
        const t = setAttr(tag, 'x', num(s * Number(getAttr(tag, 'x') ?? 0) + tx));
        return setAttr(t, 'y', num(s * Number(getAttr(tag, 'y') ?? 0) + ty));
      }
      if (el === 'linearGradient' || el === 'radialGradient') {
        if (getAttr(tag, 'gradientUnits') !== 'userSpaceOnUse') return tag;
        if (getAttr(tag, 'gradientTransform')) {
          unhandled.push('gradientTransform with userSpaceOnUse');
          return tag;
        }
        let t = tag;
        for (const [attr, off] of [
          ['x1', tx],
          ['y1', ty],
          ['x2', tx],
          ['y2', ty],
          ['cx', tx],
          ['cy', ty],
          ['fx', tx],
          ['fy', ty],
        ]) {
          const v = getAttr(t, attr);
          if (v != null) t = setAttr(t, attr, num(s * Number(v) + off));
        }
        const r = getAttr(t, 'r');
        if (r != null) t = setAttr(t, 'r', num(s * Number(r)));
        return t;
      }
      if (el === 'g') {
        if (transform) {
          unhandled.push(`g transform: ${transform}`);
          return tag;
        }
        const sw = getAttr(tag, 'stroke-width');
        if (sw != null && !svg.includes('non-scaling-stroke')) {
          return setAttr(tag, 'stroke-width', num(s * Number(sw)));
        }
        return tag;
      }
      return tag;
    }
  );

  if (unhandled.length) {
    throw new Error(`unhandled features:\n  ${unhandled.join('\n  ')}`);
  }
  return out;
}

function flattenForRaster(svg) {
  let out = svg;
  let prev;
  do {
    prev = out;
    out = out.replace(/var\(--[\w-]+\s*,\s*([^)]+)\)/g, '$1');
  } while (out !== prev);
  return (
    out
      .replace(/var\(--[\w-]+\)/g, '#888888')
      .replace(/currentColor/g, '#3a3a3a')
      // Root width/height would override the viewBox as the rasterizer's
      // intrinsic size and defeat the density mapping below.
      .replace(
        /<svg\b([^>]*)>/,
        (tag, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')}>`
      )
  );
}

// Rasterize at a density that maps the file's own viewBox straight to the
// comparison size: rendering both sides at one fixed density and resampling
// would rasterize them at different supersampling scales, and the resampling
// difference alone flips dash-edge pixels on hairline artwork.
function rasterDensity(svg) {
  const vb = svg
    .match(/viewBox="([^"]+)"/)[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return (72 * DIFF_SIZE) / Math.max(vb[2], vb[3]);
}

// The slight blur absorbs sub-pixel antialiasing phase — a rebase is exact
// algebra, but the rasterizer walks dashed hairline strokes differently at
// different numeric scales, flipping dash-edge pixels with no geometric
// change. A real mistake moves whole shapes, which survives the blur.
const AA_PHASE_BLUR_SIGMA = 1;

async function raster(svg) {
  return sharp(Buffer.from(flattenForRaster(svg)), { density: rasterDensity(svg) })
    .resize(DIFF_SIZE, DIFF_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(AA_PHASE_BLUR_SIGMA)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function badPixelFraction(svgA, svgB) {
  const [a, b] = await Promise.all([raster(svgA), raster(svgB)]);
  let bad = 0;
  const total = a.info.width * a.info.height;
  for (let p = 0; p < total; p++) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(a.data[p * 4 + c] - b.data[p * 4 + c]) > CHANNEL_TOLERANCE) {
        bad++;
        break;
      }
    }
  }
  return bad / total;
}

// The rebase (and the reference its verifier compares against) assumes the
// default alignment: any other preserveAspectRatio would be silently
// re-aligned by squaring the frame, and the verifier could not see it because
// its reference letterboxes the same way. Values equivalent to the default
// are fine; everything else fails loudly (ADR-0125).
const DEFAULT_ASPECT_VALUES = new Set(['xMidYMid', 'xMidYMid meet']);

// Exported as the seam for tools/icons/tests/rebase-icon-viewbox.test.mjs.
export async function rebaseIcon(file) {
  const original = await readFile(file, 'utf8');
  const rootTag = original.match(/<svg\b[^>]*>/)?.[0] ?? '';
  const aspect = getAttr(rootTag, 'preserveAspectRatio');
  if (aspect && !DEFAULT_ASPECT_VALUES.has(aspect.trim().replace(/\s+/g, ' '))) {
    throw new Error(
      `${file}: preserveAspectRatio="${aspect}" — the rebase and its pixel verifier assume the default xMidYMid meet; normalize the source first`
    );
  }
  const vbMatch = original.match(/viewBox="([^"]+)"/);
  if (!vbMatch) throw new Error(`${file}: no viewBox`);
  if (vbMatch[1] === CANONICAL_VIEWBOX) return { changed: false };

  const [vx, vy, vw, vh] = vbMatch[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const s = CANONICAL_SIDE / Math.max(vw, vh);
  const tx = -vx * s + (CANONICAL_SIDE - vw * s) / 2;
  const ty = -vy * s + (CANONICAL_SIDE - vh * s) / 2;

  let rebased = transformSvg(original, s, tx, ty);
  rebased = rebased
    .replace(/viewBox="[^"]+"/, `viewBox="${CANONICAL_VIEWBOX}"`)
    .replace(
      /<svg\b([^>]*)>/,
      (tag, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')}>`
    );

  // Compare against the original re-windowed to the same square frame (pure
  // viewBox math, render-equivalent): rasterizing the original at its own
  // non-square aspect rounds the letterbox to whole pixels, and that
  // half-pixel misalignment alone fails dashed hairline artwork.
  const side = Math.max(vw, vh);
  const reference = original.replace(
    /viewBox="[^"]+"/,
    `viewBox="${vx - (side - vw) / 2} ${vy - (side - vh) / 2} ${side} ${side}"`
  );
  const bad = await badPixelFraction(reference, rebased);
  if (bad > MAX_BAD_PIXEL_FRACTION) {
    if (process.env.REBASE_DEBUG_DIR) {
      await writeFile(join(process.env.REBASE_DEBUG_DIR, 'rebase-debug.svg'), rebased);
    }
    throw new Error(
      `${file}: rebase changed rendering (${(bad * 100).toFixed(3)}% pixels differ) — not writing`
    );
  }
  await writeFile(file, rebased);
  return { changed: true, bad };
}

export async function rebaseIconViewboxes(names) {
  const files = names.length
    ? names.map((n) => `${n}.svg`)
    : (await readdir(ICON_DIR)).filter((f) => f.endsWith('.svg') && !REBASE_EXEMPT.has(f)).sort();

  let changed = 0;
  for (const f of files) {
    if (REBASE_EXEMPT.has(f)) {
      console.log(`[rebase-icon-viewbox] ${f}: exempt (mascot keeps its own frame)`);
      continue;
    }
    const result = await rebaseIcon(join(ICON_DIR, f));
    if (result.changed) {
      changed++;
      console.log(
        `[rebase-icon-viewbox] ${f}: rebased (pixel diff ${(result.bad * 100).toFixed(3)}%)`
      );
    }
  }
  console.log(
    changed
      ? `[rebase-icon-viewbox] ${changed} icon(s) rebased to viewBox="${CANONICAL_VIEWBOX}" — run npm run optimize:svg-assets next.`
      : `[rebase-icon-viewbox] all icons already on viewBox="${CANONICAL_VIEWBOX}".`
  );
}

if (isMain(import.meta.url)) {
  await rebaseIconViewboxes(process.argv.slice(2));
}
