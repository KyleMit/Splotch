// Checks README.md's claims in three tiers, and says which tier each is in:
//   machine-checked — re-derived from the packaged artifacts and logs;
//   operator-observed — present verbatim in terminal/session-terminal.jsonl,
//     the recovered, redacted Bash output of the capture session. This proves
//     the text was printed, not that the printed value was independently true;
//   unsupported — stated in the README but not preserved; listed, never asserted.
// Also verifies each file against MANIFEST.json. Exits non-zero when a
// machine-checked assertion or an operator record is missing.
//   node docs/scratchpad/perf/2026-09-19-bundled-android-orientation/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

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
// The recorded command must name the run, and its printed output must match.
const observed = (claim, run, pattern) => {
  const ok = terminal.some((record) => record.command.includes(run) && pattern.test(record.output));
  console.log(`${ok ? 'ok  ' : 'FAIL'} operator-observed: ${claim}`);
  if (!ok) failures.push(claim);
};
const UNSUPPORTED = [
  'n4: whether the signal landed inside the lock-release call itself (the log shows only that contact never began)',
  'n5: the 2.1 s signal-to-exit interval was measured by the operator wrapper (Python wall clock) and printed once; no independent timestamps were kept, so it cannot be re-derived',
  'exit status and filesystem state beyond what the terminal record printed: a log without a "Wrote" line is not by itself evidence of either',
];

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

const RESTORED = /accelerometer_rotation=1\s+user_rotation=0/;
const LOCK_BACK = /"lockRotation":\{"checked":"true"[^}]*\},"forceLandscape":\{"checked":"false"/;
observed('a1 exited 0 and adb read back 1/0 with the lock on, portrait', 'a1-portrait-pen', /exit 0[\s\S]*accelerometer_rotation=1\s+user_rotation=0[\s\S]*"checked":"true"/);
observed('a2 exited 0, then adb 1/0 and the lock back on, portrait', 'a2-landscape-pen.json', /Wrote [^\n]*a2-landscape-pen\.json\s+exit 0\s+accelerometer_rotation=1\s+user_rotation=0/);
observed('a2-attempt1 exited 1 and adb read back 1/0', 'a2-landscape-pen.json', /exit 1\s+accelerometer_rotation=1\s+user_rotation=0/);
for (const [run, code] of [
  ['n1-forced-mismatch', 1],
  ['n2-failure-after-release', 1],
  ['n3-sigint', 130],
]) {
  observed(`${run} exited ${code} and ls found no artifact`, run, new RegExp(`exit ${code}[\\s\\S]*${run}\\.json: No such file or directory`));
  observed(`${run}: adb read back 1/0 afterwards`, run, RESTORED);
}
observed('n2: adb forward --list printed no forward afterwards', 'n2-failure-after-release', /user_rotation=0\s*\n\s*\n\{"viewport"/);
for (const run of ['n3b-sigint-mid-gesture', 'n4-sigint-during-release']) {
  observed(`${run} exited 130 and ls found no artifact`, 'run_sig', new RegExp(`${run} exit 130[^\\n]*\\n\\s*ls: [^\\n]*${run}\\.json: No such file`));
}
observed('n3b/n4: the "forwards: 1" count was a blank line; a raw read showed a single newline and 0 tcp entries', 'od -c', /0000000\s+\\n[\s\S]*---\s+0/);
observed('n5 exited 130, the wrapper printed 2.1 s, ls found no artifact, adb 1/0, 0 tcp forwards, lock back', 'n5-sigint-hand-window', /exit 130; exit came 2\.1 s after the signal[\s\S]*n5-sigint-hand-window\.json: No such file[\s\S]*accelerometer_rotation=1\s+user_rotation=0\s+tcp forwards: 0[\s\S]*"checked":"true"/);
check('every lock-after file matches LOCK_BACK', ['a1', 'a2', 'n1', 'n2', 'n3', 'n3b', 'n4', 'n5'].every((name) => LOCK_BACK.test(text(`controls/${name}-lock-after.json`))));

console.log('\nunsupported (not preserved; stated only as limits):');
for (const claim of UNSUPPORTED) console.log(`  - ${claim}`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(
  '\nall machine-checked assertions pass and every operator observation is present in the recovered terminal record; the unsupported items above are not claimed'
);
