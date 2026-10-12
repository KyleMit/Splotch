// Checks this package's claims and says which tier each is in:
//   machine-checked — re-derived from the packaged artifacts and logs;
//   operator-observed — printed only to the session terminal (named in
//     README.md). Each log's final `exit N` line was appended by the
//     operator's shell wrapper from $?, not written by the capture tool;
//   unsupported — listed, never asserted.
// Also verifies every file against MANIFEST.json and scans every packaged byte
// with the repo's device-identifier guard. Exits non-zero on any failure.
//   node docs/scratchpad/perf/2026-09-19-device-web-secure-origin/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { aiRunEvidenceProblem } from '../../../../tools/perf/ios/capture-xcuitest-actions.mjs';
import { scanForDeviceIdentifiers } from '../../../../tools/perf/lib/device-identifiers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} machine-checked: ${claim}`);
  if (!ok) failures.push(claim);
};

for (const entry of JSON.parse(readFileSync(join(HERE, 'MANIFEST.json'), 'utf8'))) {
  const bytes = readFileSync(join(HERE, entry.path));
  check(`manifest hash ${entry.path}`, createHash('sha256').update(bytes).digest('hex') === entry.sha256);
  const text = entry.path.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  check(`no device identifier or LAN address in ${entry.path}`,
    scanForDeviceIdentifiers(text).length === 0 && !/\b192\.168\.\d+\.\d+\b/.test(text));
}

const run = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', `${name}.json.gz`))));
const log = (name) => readFileSync(join(HERE, 'controls', `${name}.log.txt`), 'utf8');
const AI_LABELS = ['show AI waiting print', 'finish AI waiting print'];

const a1 = run('a1-android-localhost-evidence');
check('a1: page URL http://localhost:54784/ (the adb reverse itself is operator-observed), build 607f66453c4e', a1.appUrl === 'http://localhost:54784/' && a1.productCommit === '607f66453c4e95a4f8b17acb574c6004a80d32ed' && a1.buildEntry === '/_app/immutable/entry/start.Bkpsy1Ao.js');
check('a1: capture passed with no blocked coverage', a1.passed === true && a1.actionPlan?.blocked?.length === 0);
// Four repeats means repeat ids 1-4 with exactly repeat 1 as the warmup.
const coversRepeats = (artifact, label) => {
  const samples = artifact.samples.filter((sample) => sample.label === label);
  return (
    samples.map((sample) => sample.repeat).join(',') === '1,2,3,4' &&
    samples.map((sample) => sample.warmup).join(',') === 'true,false,false,false'
  );
};
for (const label of AI_LABELS) {
  check(`a1: ${label} ran repeats 1-4, repeat 1 the warmup and 2-4 scored`, coversRepeats(a1, label));
}
const evidence = a1.samples.filter((sample) => sample.label === 'finish AI waiting print').map((sample) => sample.aiRun);
check('a1: every finish sample carries aiRun evidence the capture accepts', evidence.length === 4 && evidence.every((state) => aiRunEvidenceProblem(state) === null));
check('a1: every run was a secure context with randomUUID and SubtleCrypto', evidence.every((state) => state.secureContext === true && state.randomUUID === 'function' && state.subtleCrypto === 'object' && state.origin === 'http://localhost:54784'));
check('a1: every run made exactly one request, the generate call the in-page stub answered', evidence.every((state) => state.requests === 1 && state.generateCalls === 1 && state.urls.length === 1 && state.urls[0].startsWith('/api/generate-image')));
check('a1: the wrapper-appended exit line in the log reads 0', /^exit 0$/m.test(log('a1-android-localhost-evidence')));

const a0 = run('a0-android-localhost-main-harness');
check(
  'a0: main 100f7495 harness and build on the same route, passed with no blocked coverage',
  a0.productCommit === '100f749572b7285ee2525b1467ec9e99755f600f' &&
    a0.buildEntry === '/_app/immutable/entry/start.CtxMDpz5.js' &&
    a0.appUrl === 'http://localhost:54784/' &&
    a0.passed === true &&
    a0.actionPlan?.blocked?.length === 0
);
for (const label of AI_LABELS) {
  check(`a0: ${label} ran repeats 1-4, repeat 1 the warmup`, coversRepeats(a0, label));
}
check('a0: that harness recorded no aiRun, which is why this change exists', a0.samples.every((sample) => sample.aiRun === undefined));

const n1 = run('n1-android-lan-negative');
const blocked = JSON.stringify(n1.actionPlan?.blocked ?? []);
check(
  'n1: the same build as a1 (commit and entry), reached at the LAN address on the same port',
  n1.productCommit === a1.productCommit &&
    n1.buildEntry === a1.buildEntry &&
    n1.appUrl === 'http://<lan>:54784/'
);
check('n1: the LAN run blocked both AI actions and recorded no samples', AI_LABELS.every((label) => blocked.includes(label)) && n1.passed === false && n1.samples.length === 0);
check('n1: and recorded why: not a secure context, no crypto APIs, zero requests', /\\"secureContext\\":false/.test(blocked) && /\\"randomUUID\\":\\"undefined\\"/.test(blocked) && /\\"requests\\":0/.test(blocked));
check('n1: the log names both blocked labels and its wrapper-appended exit line reads 1', /Blocked coverage: show AI waiting print, finish AI waiting print[\s\S]*^exit 1$/m.test(log('n1-android-lan-negative')));

check('preflight: Android input and rotation proven; iPad launch failed on Unknown device UDID', /✓ android input/.test(log('preflight')) && /✓ android rotation/.test(log('preflight')) && /✗ ios launch\s+Unknown device or simulator UDID/.test(log('preflight')));

console.log('\noperator-observed (terminal only; see README): the adb reverse listing, the preview pid and served entry, the build logs, and the product-source diff');
console.log('unsupported: iPad Safari has no trusted-origin result at all; see the README approval packet');
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall machine-checked assertions pass');
