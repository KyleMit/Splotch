// Checks README.md's claims in three tiers, and says which tier each is in:
//   machine-checked — re-derived from the packaged artifacts and logs (refill
//     records judged by the campaign readers' own validators);
//   operator-observed — present verbatim in terminal/session-terminal.jsonl,
//     the recovered, redacted Bash output of the capture session. This proves
//     the text was printed, not that the printed value was independently true;
//   unsupported — stated in the README but not preserved; listed, never asserted.
// Also verifies each file against MANIFEST.json. Exits non-zero when a
// machine-checked assertion or an operator record is missing.
//   node docs/scratchpad/perf/2026-09-19-bundled-android-eraser-ink/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  ERASER_PASS_MIN_ERASED_FRACTION,
  MIN_DELIVERED_STROKE_SHARE,
} from '../../../../tools/perf/android/capture-bundled-frames.mjs';
import {
  anomalousEraserRefills,
  eraserRefillShortfall,
} from '../../../../tools/perf/lib/campaign-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} machine-checked: ${claim}`);
  if (!ok) failures.push(claim);
};
const terminal = readFileSync(join(HERE, 'terminal', 'session-terminal.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const observed = (claim, run, pattern) => {
  const ok = terminal.some((record) => record.command.includes(run) && pattern.test(record.output));
  console.log(`${ok ? 'ok  ' : 'FAIL'} operator-observed: ${claim}`);
  if (!ok) failures.push(claim);
};
const UNSUPPORTED = [
  'the accessibility navigation-bar overlay and its zero-width windows: seen in a dumpsys window listing that also names unrelated installed apps, so that output was deliberately not packaged',
  'exit status and filesystem state beyond what the terminal record printed: a log without a "Wrote" line is not by itself evidence of either',
];

for (const entry of JSON.parse(readFileSync(join(HERE, 'MANIFEST.json'), 'utf8'))) {
  const sha = createHash('sha256').update(readFileSync(join(HERE, entry.path))).digest('hex');
  check(`manifest hash ${entry.path}`, sha === entry.sha256);
}

const run = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', `${name}.json.gz`))));
const text = (name) => readFileSync(join(HERE, name), 'utf8');

const b0 = run('b0-repro-main-portrait-eraser');
check(
  'b0 (main, before the fix): eraser labelled fixed-geometry-refilled with no fill or refill evidence',
  b0.brush === 'eraser' &&
    b0.gesturePlan === 'fixed-geometry-refilled' &&
    b0.gestureRepeats === 2 &&
    !('eraserFill' in b0) &&
    !('eraserRefills' in b0)
);

for (const [name, repeats, orientation] of [
  ['b1-portrait-eraser-2pass', 2, 'PORTRAIT'],
  ['b2-portrait-eraser-full-cell', 10, 'PORTRAIT'],
  ['b3-landscape-eraser-2pass', 2, 'LANDSCAPE'],
  ['b5-final-portrait-eraser-2pass', 2, 'PORTRAIT'],
]) {
  const a = run(name);
  check(
    `${name}: eraser committed and recorded, ${repeats} repeats, observed ${orientation}`,
    a.brush === 'eraser' &&
      a.report.meta.committedBrush === 'eraser' &&
      a.gestureRepeats === repeats &&
      a.gesturePlan === 'fixed-geometry-refilled' &&
      a.observedOrientation === orientation
  );
  check(
    `${name}: the initial fill was verified opaque`,
    a.eraserFill?.transparentTiles?.length === 0 && !a.eraserFill.pending
  );
  check(`${name}: one proven record per pass`, a.eraserPasses?.length === repeats);
  check(
    `${name}: every pass started on a fully inked census`,
    a.eraserPasses.every((pass) => pass.before.samples > 0 && pass.before.opaque === pass.before.samples)
  );
  check(
    `${name}: every pass erased at least the floor, with backings unchanged`,
    a.eraserPasses.every(
      (pass) =>
        pass.after.erased / pass.after.samples >= ERASER_PASS_MIN_ERASED_FRACTION &&
        JSON.stringify(pass.after.backings) === JSON.stringify(pass.before.backings)
    )
  );
  check(
    `${name}: every pass's delivered strokes all lifted, with no cancel, at or above the delivery floor`,
    a.eraserPasses.every(
      (pass) =>
        pass.lifts.downs === pass.lifts.ups &&
        !pass.lifts.cancels &&
        pass.lifts.ups >= pass.plannedStrokes * MIN_DELIVERED_STROKE_SHARE
    )
  );
  check(
    `${name}: ${repeats - 1} healthy refills by the campaign readers`,
    a.eraserRefills.length === repeats - 1 &&
      anomalousEraserRefills(a).length === 0 &&
      eraserRefillShortfall(a, repeats) === null
  );
  check(
    `${name}: strokes delivered equals the sum of each pass's lifts`,
    a.strokes.delivered === a.eraserPasses.reduce((sum, pass) => sum + pass.lifts.ups, 0)
  );
  // Every census and refill reports the page-time interval it ran in; none may
  // overlap a trusted canvas stroke (down to up, by pointer id) or contain a
  // frame the probe marked in contact — the frames the drawing gate scores.
  const readbacks = [
    ...a.eraserPasses.flatMap((pass) => [pass.before.at, pass.after.at]),
    ...a.eraserRefills.map((refill) => refill.at),
  ];
  const strokes = [];
  const open = new Map();
  for (const row of a.report.events) {
    if (row[6] !== 1 || row[8] !== 1) continue;
    if (row[2] === 0) open.set(row[3], row[1]);
    if (row[2] === 2 && open.has(row[3])) {
      strokes.push([open.get(row[3]), row[1]]);
      open.delete(row[3]);
    }
  }
  const overlaps = ([start, end], [from, to]) => start <= to && from <= end;
  check(
    `${name}: all ${readbacks.length} readbacks recorded an interval`,
    readbacks.length === repeats * 2 + (repeats - 1) &&
      readbacks.every((at) => Array.isArray(at) && at[0] <= at[1])
  );
  check(
    `${name}: no readback overlaps any of the ${strokes.length} trusted canvas strokes`,
    strokes.length === a.strokes.delivered &&
      readbacks.every((at) => strokes.every((stroke) => !overlaps(at, stroke)))
  );
  check(
    `${name}: no in-contact probe frame falls inside a readback`,
    readbacks.every((at) => a.report.frames.every(([t, , contact]) => !contact || t < at[0] || t > at[1]))
  );
  check(`${name}: cleanup succeeded and fidelity passed`, a.cleanup.every((s) => s.ok) && a.fidelity.passed);
}
const b2 = run('b2-portrait-eraser-full-cell');
check(
  'b2: portrait delivered 14 of 16 planned strokes on every pass',
  b2.strokes.planned === 160 &&
    b2.eraserPasses.every((pass) => pass.plannedStrokes === 16 && pass.lifts.ups === 14)
);
const b3 = run('b3-landscape-eraser-2pass');
check(
  'b3: landscape delivered every planned stroke',
  b3.strokes.planned === 32 && b3.strokes.delivered === 32
);

const b4 = run('b4-portrait-pen');
check(
  'b4: an ordinary pen capture still works and carries no eraser evidence',
  b4.brush === 'pen' &&
    b4.report.meta.committedBrush === 'pen' &&
    b4.gesturePlan === 'fixed-geometry' &&
    b4.eraserFill === null &&
    b4.eraserRefills === null &&
    b4.eraserPasses === null &&
    b4.fidelity.passed &&
    b4.strokes.planned === 16 &&
    b4.strokes.delivered === 14
);

for (const [log, pattern] of [
  ['b1-attempt1-required-16-strokes', /pass 1 expected 16 trusted canvas strokes, saw 14 pointerdowns and 14 pointerups/],
  ['nb1-blank-preparation', /before pass 1, the paper is not fully inked where the eraser will travel: tile 0 0\/4096 opaque/],
  ['nb2-failed-refill', /the eraser refill after pass 1 failed: .*"transparentTiles":\[4,10,11,14,15\]/],
  ['nb3-stroke-removes-no-ink', /pass 1 erased 0 of 81920 census samples, under the 0.5% floor/],
]) {
  check(`${log}: refused with the expected reason`, pattern.test(text(`controls/${log}.log.txt`)));
  check(`${log}: log contains no "Wrote" line`, !/^Wrote /m.test(text(`controls/${log}.log.txt`)));
}

const delivery = text('diag/swipe-delivery-1.log.txt');
check(
  'swipe probe: a swipe starting at the portrait screen centre delivers nothing; 20 px aside it delivers',
  /^seg2 as planned \[\]$/m.test(delivery) &&
    /^seg6 as planned \[\]$/m.test(delivery) &&
    /^nearby start 520 \[\["pointerdown"/m.test(delivery) &&
    /^seg2 reversed \[\["pointerdown"/m.test(delivery)
);

const superseded = (name) =>
  JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', 'superseded', `${name}.json.gz`))));
const passErasures = (a) => a.eraserPasses.map((pass) => pass.after.erased);
const worstRelativeGap = Math.max(
  ...['b1-portrait-eraser-2pass', 'b2-portrait-eraser-full-cell', 'b3-landscape-eraser-2pass'].flatMap(
    (name) => {
      const before = passErasures(superseded(name));
      const after = passErasures(run(name));
      return before.map((value, index) => Math.abs(value - after[index]) / after[index]);
    }
  )
);
check(
  `superseded b1–b3 runs (no readback intervals) erased within 0.83% of the re-runs, pass for pass (worst ${(worstRelativeGap * 100).toFixed(2)}%)`,
  worstRelativeGap <= 0.0083
);
check(
  'superseded runs record no readback intervals, which is why they were re-run',
  superseded('b1-portrait-eraser-2pass').eraserPasses.every((pass) => pass.before.at === undefined)
);

observed('b0: a readback after the main run found the eraser committed and 0 inked samples', 'b-repro-portrait-eraser', /"committed":"eraser"[^\n]*"inkedSamples":0/);
observed('b1-attempt1 exited 1', 'b1-portrait-eraser-2pass', /saw 14 pointerdowns and 14 pointerups[\s\S]*exit 1/);
observed('b2, b3, b4 each exited 0', 'b2-portrait-eraser-full-cell', /b2-portrait-eraser-full-cell exit 0[\s\S]*b3-landscape-eraser-2pass exit 0[\s\S]*b4-portrait-pen exit 0/);
for (const neg of ['nb1-blank-preparation', 'nb2-failed-refill', 'nb3-stroke-removes-no-ink']) {
  observed(`${neg} exited 1 and ls found no artifact`, 'nb1-blank-preparation', new RegExp(`${neg} exit 1[\\s\\S]*${neg}\\.json: No such file or directory`));
}
observed('after the negatives, adb read back 1/0', 'nb1-blank-preparation', /accelerometer_rotation=1\s+user_rotation=0/);
observed('b1, b2, b3 re-runs each exited 0, and the lock was on, portrait, afterwards', 'superseded-no-intervals', /b1-portrait-eraser-2pass exit 0[\s\S]*b2-portrait-eraser-full-cell exit 0[\s\S]*b3-landscape-eraser-2pass exit 0[\s\S]*accelerometer_rotation=1\s+user_rotation=0[\s\S]*"lockRotation":\{"checked":"true"/);
observed('b5 exited 0', 'b5-final-portrait', /^exit 0$/m);

console.log('\nunsupported (not preserved; stated only as limits):');
for (const claim of UNSUPPORTED) console.log(`  - ${claim}`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(
  '\nall machine-checked assertions pass and every operator observation is present in the recovered terminal record; the unsupported items above are not claimed'
);
