// Compares DS-1 state captures of two arms on one target: control frames (2 pt/dp), the control
// set, menu selection, token colours (2/255) at each arm's own control centres, and an ImageMagick
// pixel diff with a side-by-side for the inspector. Reads <target-dir>/<arm>/<combo>/s*.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { isMain, runMain } from '../lib/proc.mjs';
import { parseFlags } from './lib/cli-flags.mjs';

const GEOMETRY_TOLERANCE_PT = 2;
const COLOR_TOLERANCE = 2;
const SAMPLE_RADIUS_PX = 2;
const BAR_SAMPLE_RADIUS_PX = 1;
const BAR_SAMPLE_BELOW_TOP_PT = 2;
// A point inside the status band of a WebView reference, which draws its own band.
const STATUS_BAND_POINT_PT = { x: 60, y: 8 };
const DIFF_FUZZ = '3%';
const SIDE_BY_SIDE_SCALE = '33%';
const SWATCHES = ['Purple', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Custom Color'];
const COLORED_SWATCHES = SWATCHES.slice(0, 6);
const SIZES = [1, 2, 3, 4, 5];
const CONTROLS = new Set([
  ...SWATCHES,
  'Clear drawing',
  'Expand controls',
  'Collapse controls',
  'Undo',
  'Save screenshot',
  'Coloring books',
  'Stroke width',
  'Brushes',
  'Settings',
  'Pen',
  'Crayon',
  'Magic brush',
  'Eraser',
  'Colors',
  ...SIZES.map((n) => `Size ${n}`),
  ...SIZES.map((n) => `Eraser size ${n}`),
]);
const SELECTABLE = /^(Pen|Crayon|Magic brush|Eraser|Size \d|Eraser size \d)$/;
const COLOR_STATES = /^s0[1-5]/;

const FLAGS = {
  'target-dir': { type: 'string' },
  subject: { type: 'string' },
  reference: { type: 'string' },
  out: { type: 'string' },
};

export function parseCompareStatesFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['target-dir', 'subject', 'reference', 'out'],
  });
  return {
    targetDir: values['target-dir'],
    subject: values.subject,
    reference: values.reference,
    out: values.out,
  };
}

const isCompared = (name) => CONTROLS.has(name) || /^#[0-9A-F]{6}$/i.test(name);
const selectedOf = (frame) =>
  Boolean(frame) && (frame.value === '1' || frame.selected === 'true' || frame.checked === 'true');
const center = (frame, scale) => [
  (frame.frame.x + frame.frame.w / 2) * scale,
  (frame.frame.y + frame.frame.h / 2) * scale,
];
const maxChannelDelta = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Keeps the interactive element when an icon or label duplicates the name.
function framesByName(sidecar) {
  const byName = new Map();
  for (const frame of sidecar.frames) {
    if (!isCompared(frame.name)) continue;
    if (!byName.has(frame.name) || /Button|Switch/.test(frame.tag)) byName.set(frame.name, frame);
  }
  return byName;
}

async function rgbAt(png, [x, y], radius = SAMPLE_RADIUS_PX) {
  const { data, info } = await sharp(png)
    .extract({
      left: Math.max(0, Math.round(x) - radius),
      top: Math.max(0, Math.round(y) - radius),
      width: 2 * radius + 1,
      height: 2 * radius + 1,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  const count = info.width * info.height;
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) sum[k] += data[i * info.channels + k];
  }
  return sum.map((value) => Math.round(value / count));
}

function geometryDiffs(a, b) {
  const diffs = [];
  for (const [name, fa] of a) {
    const fb = b.get(name);
    if (!fb) continue;
    const d = {
      left: fa.frame.x - fb.frame.x,
      top: fa.frame.y - fb.frame.y,
      right: fa.frame.x + fa.frame.w - (fb.frame.x + fb.frame.w),
      bottom: fa.frame.y + fa.frame.h - (fb.frame.y + fb.frame.h),
    };
    const worst = Math.max(...Object.values(d).map(Math.abs));
    if (worst > GEOMETRY_TOLERANCE_PT) {
      diffs.push({ name, subject: fa.frame, reference: fb.frame, d, worst: +worst.toFixed(1) });
    }
  }
  return diffs;
}

function selectionDiffs(a, b) {
  return [...a]
    .filter(([name]) => b.has(name) && SELECTABLE.test(name))
    .filter(([name, fa]) => selectedOf(fa) !== selectedOf(b.get(name)))
    .map(([name, fa]) => ({ name, subject: selectedOf(fa), reference: selectedOf(b.get(name)) }));
}

async function colorDiffs({ a, b, pngs, scales, referenceKind }) {
  const diffs = [];
  const compare = async (what, pointA, pointB, radius) => {
    const ca = await rgbAt(pngs.subject, pointA, radius);
    const cb = await rgbAt(pngs.reference, pointB, radius);
    const maxDelta = maxChannelDelta(ca, cb);
    if (maxDelta > COLOR_TOLERANCE) diffs.push({ what, subject: ca, reference: cb, maxDelta });
  };
  for (const name of COLORED_SWATCHES) {
    if (!a.has(name) || !b.has(name)) continue;
    const pointA = center(a.get(name), scales.subject);
    await compare(`${name} swatch centre`, pointA, center(b.get(name), scales.reference));
  }
  // The palette surface between the first two swatches.
  const between = (map, scale) => {
    const [first, second] = [map.get('Purple'), map.get('Blue')];
    const x = (first.frame.x + first.frame.w + second.frame.x) / 2;
    return [x * scale, (first.frame.y + BAR_SAMPLE_BELOW_TOP_PT) * scale];
  };
  if (['Purple', 'Blue'].every((name) => a.has(name) && b.has(name))) {
    const surface = 'palette surface between swatches';
    await compare(
      surface,
      between(a, scales.subject),
      between(b, scales.reference),
      BAR_SAMPLE_RADIUS_PX
    );
  }
  // Only the WebView reference draws its own status band; a native reference has none to compare.
  if (referenceKind === 'webview-reference') {
    const band = (scale) => [STATUS_BAND_POINT_PT.x * scale, STATUS_BAND_POINT_PT.y * scale];
    await compare('status band (60,8)', band(scales.subject), band(scales.reference));
  }
  return diffs;
}

function pixelDiff(subjectPng, referencePng, out, stem) {
  const diffPng = join(out, `${stem}__diff.png`);
  let diffPixels;
  try {
    execFileSync(
      'magick',
      ['compare', '-metric', 'AE', '-fuzz', DIFF_FUZZ, subjectPng, referencePng, diffPng],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    diffPixels = 0;
  } catch (error) {
    diffPixels = Number(String(error.stderr).trim().split(/\s/)[0]);
  }
  const sideBySide = join(out, `${stem}__sbs.png`);
  execFileSync('magick', [
    subjectPng,
    referencePng,
    diffPng,
    '+append',
    '-resize',
    SIDE_BY_SIDE_SCALE,
    sideBySide,
  ]);
  return { diffPixels, sideBySide };
}

async function compareState({ subjectDir, referenceDir, key, stem, out }) {
  const subject = readJson(join(subjectDir, `${stem}.json`));
  const reference = readJson(join(referenceDir, `${stem}.json`));
  const a = framesByName(subject);
  const b = framesByName(reference);
  const pngs = {
    subject: join(subjectDir, `${stem}.png`),
    reference: join(referenceDir, `${stem}.png`),
  };
  const scales = {
    subject: readJson(join(subjectDir, 'paper.json')).imagePxPerPt,
    reference: readJson(join(referenceDir, 'paper.json')).imagePxPerPt,
  };
  const color = COLOR_STATES.test(stem)
    ? await colorDiffs({ a, b, pngs, scales, referenceKind: reference.kind })
    : [];
  return {
    key,
    stem,
    paired: true,
    settled: { subject: subject.settle.settled, reference: reference.settle.settled },
    onlySubject: [...a.keys()].filter((name) => !b.has(name)),
    onlyReference: [...b.keys()].filter((name) => !a.has(name)),
    geometry: geometryDiffs(a, b),
    selection: selectionDiffs(a, b),
    color,
    ...pixelDiff(pngs.subject, pngs.reference, out, `${key}__${stem}`),
  };
}

function summaryLine(row) {
  if (!row.paired) {
    return `${row.key} ${row.stem}: unpaired (subject settled=${row.settled.subject})`;
  }
  const geometry = row.geometry.map((g) => `${g.name}:${g.worst}`).join(' ');
  const color = row.color.map((c) => `${c.what}:${c.maxDelta}`).join('; ');
  return (
    `${row.key} ${row.stem}: diffPx=${row.diffPixels} ` +
    `settled=${row.settled.subject}/${row.settled.reference} ` +
    `onlySubject=[${row.onlySubject}] onlyReference=[${row.onlyReference}] ` +
    `sel=${JSON.stringify(row.selection)} color=${color} geom>${GEOMETRY_TOLERANCE_PT}: ${geometry}`
  );
}

export async function compareParityStates({ targetDir, subject, reference, out }) {
  mkdirSync(out, { recursive: true });
  const subjectRoot = join(targetDir, subject);
  const referenceRoot = join(targetDir, reference);
  const rows = [];
  for (const key of readdirSync(subjectRoot).sort()) {
    const subjectDir = join(subjectRoot, key);
    const referenceDir = join(referenceRoot, key);
    const stems = readdirSync(subjectDir)
      .filter((name) => /^s\d\d-.*\.json$/.test(name))
      .map((name) => name.replace(/\.json$/, ''));
    for (const stem of stems) {
      if (!existsSync(join(referenceDir, `${stem}.json`))) {
        const settled = { subject: readJson(join(subjectDir, `${stem}.json`)).settle.settled };
        rows.push({ key, stem, paired: false, settled });
        continue;
      }
      rows.push(await compareState({ subjectDir, referenceDir, key, stem, out }));
    }
  }
  writeFileSync(join(out, 'results.json'), JSON.stringify(rows, null, 1));
  for (const row of rows) console.log(summaryLine(row));
  return rows;
}

if (isMain(import.meta.url)) {
  runMain(() => compareParityStates(parseCompareStatesFlags(process.argv.slice(2))));
}
