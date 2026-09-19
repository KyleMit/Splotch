// Re-derives every claim in README.md from the packaged files alone, and
// verifies each file against MANIFEST.json. Exits non-zero on any mismatch.
//   node docs/scratchpad/perf/2026-09-19-bundled-android-orientation/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
};

for (const entry of JSON.parse(readFileSync(join(HERE, 'MANIFEST.json'), 'utf8'))) {
  const sha = createHash('sha256').update(readFileSync(join(HERE, entry.path))).digest('hex');
  check(`manifest hash ${entry.path}`, sha === entry.sha256);
}

const run = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', `${name}.json.gz`))));
const text = (name) => readFileSync(join(HERE, name), 'utf8');
const lock = (name) => JSON.parse(text(`controls/${name}-lock-after.json`));
const vp = (viewport) => `${viewport.w}x${viewport.h}`;

const a0 = run('a0-repro-main-landscape-pen');
check(
  'a0 (main, before the fix): labelled LANDSCAPE, measured 360x780 portrait',
  a0.orientation === 'LANDSCAPE' && vp(a0.report.meta.viewport) === '360x780'
);
check('a0 records no observed orientation', a0.observedOrientation === undefined);

const a1 = run('a1-portrait-pen');
check(
  'a1: PORTRAIT requested and observed at 360x780, lock untouched',
  a1.orientation === 'PORTRAIT' &&
    a1.observedOrientation === 'PORTRAIT' &&
    vp(a1.report.meta.viewport) === '360x780' &&
    a1.rotationLock.released === false
);

const a2 = run('a2-landscape-pen');
const before = a2.pageGeometry.beforeContact;
check(
  'a2: launched portrait under the app lock, then observed LANDSCAPE 780x360',
  a2.pageGeometry.launched.viewport.width === 360 &&
    a2.observedOrientation === 'LANDSCAPE' &&
    before.viewport.width === 780 &&
    before.viewport.height === 360 &&
    vp(a2.report.meta.viewport) === '780x360'
);
check(
  'a2: the portrait lock was released and is recorded for restoration',
  a2.rotationLock.released === true && a2.rotationLock.initial?.lockedOrientation === 'portrait'
);
check(
  'a2: geometry identical before and after contact',
  JSON.stringify(a2.pageGeometry.beforeContact) === JSON.stringify(a2.pageGeometry.afterContact)
);
for (const [name, artifact] of [
  ['a1', a1],
  ['a2', a2],
]) {
  check(`${name}: every cleanup step succeeded`, artifact.cleanup.every((step) => step.ok));
  check(`${name}: trusted-input fidelity passed`, artifact.fidelity.passed === true);
}

for (const name of ['a1', 'a2-attempt1', 'a2', 'n1', 'n2', 'n3', 'n3b', 'n4', 'n5']) {
  const state = lock(name);
  check(
    `${name}: afterwards the app lock is back on, portrait`,
    state.lockRotation?.checked === 'true' && state.forceLandscape?.checked === 'false'
  );
}
check(
  'a2 attempt 1 (no re-assert) failed loudly on the mismatch',
  /not the requested LANDSCAPE — after releasing the app's rotation lock/.test(
    text('controls/a2-attempt1-no-reassert.log.txt')
  )
);
check(
  'n1 (forced mismatch) failed loudly on the mismatch',
  /not the requested LANDSCAPE — after releasing the app's rotation lock/.test(
    text('controls/n1-forced-mismatch.log.txt')
  )
);
check(
  'n2 failed after the orientation was established',
  /Timed out waiting for bogus campaign theme/.test(text('controls/n2-failure-after-release.log.txt'))
);
check(
  'unlock experiments: page stayed portrait across four post-unlock reads (~1.5 s; labels overstate) and turned only after a user_rotation write',
  [text('diag/unlock-experiment-1.log.txt'), text('diag/unlock-experiment-2-same-value.log.txt')].every(
    (log) =>
      /after-unlock\+3000 \[360,780,"portrait-primary"\]/.test(log) &&
      /after-(reassert|same-value-put) \[780,360,"landscape-primary"\]/.test(log)
  )
);

for (const name of ['n3b-sigint-mid-gesture', 'n4-sigint-during-release', 'n5-sigint-hand-window']) {
  check(
    `${name}: the fence deferred the signal to the next step`,
    /interrupted: stopping at the next step, then restoring the rig/.test(
      text(`controls/${name}.log.txt`)
    )
  );
}
check(
  'n4 was interrupted before contact',
  !/^canvas /m.test(text('controls/n4-sigint-during-release.log.txt'))
);

if (failures.length) {
  console.error(`\n${failures.length} claim(s) failed`);
  process.exit(1);
}
console.log('\nall claims reproduce');
