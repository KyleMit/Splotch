// Compares two arms' batches of one parity slice: end-state controls (frames within 2 pt, the
// control set, enabled/selected/value) and motion-burst spans per step, plus side-by-side stills.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { isMain, runMain } from '../lib/proc.mjs';
import { parseFlags } from './lib/cli-flags.mjs';

const FRAME_TOLERANCE_PT = 2;
// Two frames at 60 Hz.
const MOTION_TOLERANCE_MS = 2 * (1000 / 60);
const STILL_SCALE_DIVISOR = 3;
const STILL_GUTTER_PX = 12;
const MOVED_LISTED_MAX = 6;
const IGNORED =
  /^(rsd-|paper-|drawing-|pointer-halos|Splotch|main$|Vertical scroll|Horizontal scroll)/;
const COMPARED_ROLES = /Button|Switch|Slider|StaticText|Image|Cell/;
const STATE_FIELDS = ['enabled', 'selected', 'value'];

const FLAGS = {
  subject: { type: 'string' },
  reference: { type: 'string' },
  out: { type: 'string' },
};

export function parseCompareSlicesFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['subject', 'reference', 'out'],
  });
  return { subjectDir: values.subject, referenceDir: values.reference, out: values.out };
}

const controls = (frames) =>
  new Map(
    frames
      .filter((frame) => !IGNORED.test(frame.name) && COMPARED_ROLES.test(frame.tag))
      .map((frame) => [frame.name, frame])
  );

// Recorded input times land when Appium's action call returns, after the motion it caused, so
// bursts are reported relative to the step's last input.
function motionSummary(record) {
  const bursts = record.motion?.bursts ?? [];
  const lastInput = record.inputs.at(-1)?.atS ?? 0;
  const span = bursts.length ? Math.round((bursts.at(-1).end - bursts[0].start) * 1000) : 0;
  return {
    bursts: bursts.map((burst) => [Math.round((burst.start - lastInput) * 1000), burst.spanMs]),
    span,
  };
}

function compareStep(subject, reference) {
  const a = controls(subject.frames);
  const b = controls(reference.frames);
  const moved = [];
  const stateDiff = [];
  for (const [name, fa] of a) {
    const fb = b.get(name);
    if (!fb) continue;
    const delta = Math.max(
      Math.abs(fa.frame.x - fb.frame.x),
      Math.abs(fa.frame.y - fb.frame.y),
      Math.abs(fa.frame.w - fb.frame.w),
      Math.abs(fa.frame.h - fb.frame.h)
    );
    if (delta > FRAME_TOLERANCE_PT) moved.push(`${name} Δ${Math.round(delta)}`);
    for (const field of STATE_FIELDS) {
      const [va, vb] = [fa[field] ?? '', fb[field] ?? ''];
      if (va !== vb) stateDiff.push(`${name}.${field} subject=${va} reference=${vb}`);
    }
  }
  const ma = motionSummary(subject);
  const mb = motionSummary(reference);
  return {
    id: subject.id,
    subjectError: subject.error,
    referenceError: reference.error,
    settled: [subject.settle.settled, reference.settle.settled],
    onlySubject: [...a.keys()].filter((name) => !b.has(name)),
    onlyReference: [...b.keys()].filter((name) => !a.has(name)),
    moved,
    stateDiff,
    motion: {
      subject: ma,
      reference: mb,
      spanDeltaMs: ma.span - mb.span,
      withinTolerance: Math.abs(ma.span - mb.span) <= MOTION_TOLERANCE_MS,
    },
  };
}

async function sideBySide(subjectPng, referencePng, file) {
  const { width, height } = await sharp(subjectPng).metadata();
  const w = Math.round(width / STILL_SCALE_DIVISOR);
  const h = Math.round(height / STILL_SCALE_DIVISOR);
  const left = await sharp(subjectPng).resize(w, h).png().toBuffer();
  const right = await sharp(referencePng).resize(w, h).png().toBuffer();
  await sharp({
    create: { width: w * 2 + STILL_GUTTER_PX, height: h, channels: 3, background: '#888' },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: w + STILL_GUTTER_PX, top: 0 },
    ])
    .png()
    .toFile(file);
}

function printRow(row) {
  const flags = [];
  if (row.subjectError || row.referenceError) {
    flags.push(`ERR subject=${row.subjectError ?? ''} reference=${row.referenceError ?? ''}`);
  }
  if (row.onlySubject?.length) flags.push(`onlySubject[${row.onlySubject.join('|')}]`);
  if (row.onlyReference?.length) flags.push(`onlyReference[${row.onlyReference.join('|')}]`);
  if (row.stateDiff?.length) flags.push(`state[${row.stateDiff.join('; ')}]`);
  if (row.moved?.length) {
    const more = row.moved.length > MOVED_LISTED_MAX ? ', …' : '';
    flags.push(`moved[${row.moved.slice(0, MOVED_LISTED_MAX).join(', ')}${more}]`);
  }
  const m = row.motion;
  const side = (summary) => (m ? `${JSON.stringify(summary.bursts)} span ${summary.span}` : '-');
  const delta = m && !m.withinTolerance ? `Δ${m.spanDeltaMs}` : '';
  console.log(
    `${row.id.padEnd(26)} motion subject ${side(m?.subject)} | reference ${side(m?.reference)} ${delta}`
  );
  if (flags.length) console.log(`${''.padEnd(26)} ${flags.join('  ')}`);
}

export async function compareParitySlices({ subjectDir, referenceDir, out }) {
  mkdirSync(out, { recursive: true });
  const stepIds = readdirSync(subjectDir)
    .filter((name) => name.endsWith('.json') && name !== 'batch.json')
    .map((name) => name.slice(0, -'.json'.length));
  const rows = [];
  for (const id of stepIds) {
    const referencePath = join(referenceDir, `${id}.json`);
    if (!existsSync(referencePath)) {
      rows.push({ id, note: 'reference missing' });
      continue;
    }
    const subject = JSON.parse(readFileSync(join(subjectDir, `${id}.json`), 'utf8'));
    const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
    rows.push(compareStep(subject, reference));
    const [stillA, stillB] = [join(subjectDir, `${id}.png`), join(referenceDir, `${id}.png`)];
    if (existsSync(stillA) && existsSync(stillB)) {
      await sideBySide(stillA, stillB, join(out, `${id}.sbs.png`));
    }
  }
  writeFileSync(join(out, 'compare.json'), JSON.stringify(rows, null, 1));
  for (const row of rows) printRow(row);
  return rows;
}

if (isMain(import.meta.url)) {
  runMain(() => compareParitySlices(parseCompareSlicesFlags(process.argv.slice(2))));
}
