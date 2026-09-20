// Offline negative controls for check.mjs. Each mutation alters one packaged reduction in a scratch
// copy, REFRESHES its manifest hash, and must still fail the content claims it targets.
//   node docs/scratchpad/perf/2026-09-19-animation-historical-r1/negative-controls.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const SRC = 'docs/scratchpad/perf/2026-09-19-animation-historical-r1';
const SCRATCH = 'docs/scratchpad/perf/zz-animation-historical-mutation-scratch';
const GAP_COLUMN = 0;

// [packaged file, claim prefixes that must FAIL, mutation]
const MUTATIONS = {
  'after build relabelled as the before arm': [
    'runs/android-chrome.before-1',
    ["runs/android-chrome.before-1: the artifact's own served entry and build digest"],
    (run) => {
      run.buildEntry = '/_app/immutable/entry/start.iaOk9c5R.js';
      run.buildDigest = '2266c03ea498d27e5c8a9fc3011f1a19826cc96286169443553f51e2ed1a933d';
    },
  ],
  'iPad native Magic gaps capped at 30 ms': [
    'runs/ipad-native.after-2',
    [
      'runs/ipad-native.after-2: every stored summary',
      'ipad-native: `select Magic brush` shows a roughly 80 ms scored gap',
    ],
    (run) => {
      for (const sample of run.samples.filter((entry) => entry.label === 'select Magic brush')) {
        for (const row of sample.postActionFrameRows) row[GAP_COLUMN] = Math.min(row[GAP_COLUMN], 30);
      }
    },
  ],
  'a finish sample that ran on an insecure origin': [
    'runs/android-chrome.after-1',
    ['runs/android-chrome.after-1: both AI waiting actions ran unblocked'],
    (run) => {
      const sample = run.samples.find(
        (entry) => entry.label === 'finish AI waiting print' && entry.repeat === 3
      );
      sample.aiRun.secureContext = false;
      sample.aiRun.requests = 0;
    },
  ],
  'a legacy ambiguous open relabelled as a first open': [
    'reused/android-web.r2.before-1',
    [
      'reused/android-web.r2.before-1: no sample carries either first-open or reopen label',
      'reused/android-web.r2: it alone ran the legacy coloring sequence',
    ],
    (run) => {
      for (const sample of run.samples) {
        if (sample.label === 'open coloring books') sample.label = 'first open of coloring books';
      }
    },
  ],
  'both Settings actions removed from an Android capture': [
    'runs/android-chrome.after-2',
    ['runs/android-chrome.after-2: exactly the idle control plus the 19 non-coloring actions'],
    (run) => {
      const settings = (label) => label === 'open Settings' || label === 'close Settings';
      run.samples = run.samples.filter((entry) => !settings(entry.label));
      run.summaries = run.summaries.filter((entry) => !settings(entry.label));
      run.actionPlan.applicableLabels = run.actionPlan.applicableLabels.filter(
        (label) => !settings(label)
      );
    },
  ],
  'an Android coloring-page clear that fails on first frame instead of post P95': [
    'runs/android-chrome.before-1',
    ['android-chrome: `clear drawing on a coloring page` is the only red action'],
    (run) => {
      for (const sample of run.samples.filter(
        (entry) => entry.label === 'clear drawing on a coloring page'
      )) {
        sample.firstFrameMs = 100;
        for (const row of sample.postActionFrameRows) row[GAP_COLUMN] = Math.min(row[GAP_COLUMN], 17);
      }
    },
  ],
  'a scored repeat dropped from one action': [
    'runs/ipad-native.before-2',
    ['runs/ipad-native.before-2: every applicable action ran in one warmup'],
    (run) => {
      run.samples = run.samples.filter(
        (entry) => !(entry.label === 'undo latest stroke' && entry.repeat === 4)
      );
    },
  ],
};

const problems = [];
for (const [name, [file, expected, mutate]] of Object.entries(MUTATIONS)) {
  rmSync(SCRATCH, { recursive: true, force: true });
  cpSync(SRC, SCRATCH, { recursive: true });
  const relative = `${file}.actions.reduced.json.gz`;
  const path = `${SCRATCH}/${relative}`;
  const run = JSON.parse(gunzipSync(readFileSync(path)));
  mutate(run);
  const bytes = gzipSync(Buffer.from(JSON.stringify(run)), { level: 9 });
  writeFileSync(path, bytes);
  const manifest = JSON.parse(readFileSync(`${SCRATCH}/MANIFEST.json`));
  manifest.files.find((entry) => entry.path === relative).sha256 = createHash('sha256')
    .update(bytes)
    .digest('hex');
  writeFileSync(`${SCRATCH}/MANIFEST.json`, JSON.stringify(manifest, null, 2));
  const out = spawnSync(process.execPath, [`${SCRATCH}/check.mjs`], { encoding: 'utf8' });
  const failed = out.stdout
    .split('\n')
    .filter((line) => line.startsWith('FAIL'))
    .map((line) => line.replace('FAIL ', ''));
  console.log(`\n## ${name}: exit ${out.status}`);
  for (const claim of failed) console.log(`  ${claim}`);
  if (out.status !== 1) problems.push(`${name}: checker exited ${out.status}, expected 1`);
  if (failed.some((claim) => claim.startsWith('manifest hash'))) {
    problems.push(`${name}: the manifest hash failed, so the content check was not isolated`);
  }
  for (const prefix of expected) {
    if (!failed.some((claim) => claim.startsWith(prefix))) {
      problems.push(`${name}: expected a failure starting "${prefix}"`);
    }
  }
}
rmSync(SCRATCH, { recursive: true, force: true });
if (problems.length) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nevery mutation failed its targeted claims, and only by content');
