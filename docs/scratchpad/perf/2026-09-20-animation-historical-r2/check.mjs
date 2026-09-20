// Recomputes the historical ABBA evidence with this checkout's unchanged action scorer.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  ABBA,
  SETS,
  armOf,
  loadedOnlyArmEntry,
  matchesDeclaredControls,
  readRun,
  rescore,
  root,
} from './lib.mjs';

const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
};
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const codeFiles = new Set(['MANIFEST.json', 'README.md', 'check.mjs', 'compare.mjs', 'lib.mjs', 'negative-controls.mjs', 'package.mjs']);
const manifest = read('MANIFEST.json');
const listed = manifest.files.map((entry) => entry.path);
const actual = walk(root).map((path) => relative(root, path)).filter((path) => !codeFiles.has(path)).sort();
check('manifest contains every packaged evidence file exactly once', JSON.stringify(listed) === JSON.stringify(actual));
for (const { path, sha256 } of manifest.files) {
  const hash = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  check(`manifest hash ${path}`, hash === sha256);
}

const identity = read('BUILD-IDENTITY.json');
const coverage = read('COVERAGE.json');
const expected = SETS.flatMap(([, target]) => ABBA.map((capture) => `${target}-${capture}`));
const order = readFileSync(join(root, 'CAPTURE-ORDER.tsv'), 'utf8').trimEnd().split('\n').slice(1).map((line) => {
  const [target, capture, completedUtc, rawSha256, verdict] = line.split('\t');
  return { name: `${target}-${capture}`, completedUtc, rawSha256, verdict };
});
check('coverage names every planned target and ABBA position exactly once', JSON.stringify(coverage.map((entry) => entry.name)) === JSON.stringify(expected));
check('before and after source revisions are the immutable PR 1867 parent and merge',
  identity.before.commit === 'a9b633c4392de7ca943d3f927ff86686956cdb83' &&
  identity.after.commit === '751093de306f08f771f52f85996f55838b7b0d15');

const WEB_GROUPS = ['idle','palette','color-picker','brushes','stroke-width','settings','coloring','screenshot','ai-waiting','undo','unavailable','clear'];
const NATIVE_GROUPS = ['palette','clear','brushes','stroke-width','undo','settings','color-picker','coloring','ai-waiting','unavailable','screenshot'];
const COLORING = ['first open of coloring books', 'reopen coloring books', 'open coloring book', 'scroll coloring pages', 'select coloring page', 'clear coloring page'];
const AI = ['show AI waiting print', 'finish AI waiting print'];
const figures = (summary) => JSON.stringify([
  summary.label, summary.passed, summary.count, summary.totalCount, summary.activation,
  summary.firstFrame, summary.ready, summary.frames, summary.frameSamples, summary.frameStamps,
]);
const runs = new Map();
for (const [directory, target, captures] of SETS) {
  for (const capture of captures) {
    const name = `${target}-${capture}`;
    const state = coverage.find((entry) => entry.name === name);
    if (state.status === 'hole') {
      check(`${name}: exact hole reason retained`, typeof state.reason === 'string' && state.reason.length > 10);
      continue;
    }
    check(`${name}: marked as a complete canonical capture`, state.status === 'captured');
    const run = readRun(directory, target, capture);
    runs.set(name, run);
    const rescored = rescore(run);
    check(`${name}: stored summaries reproduce from all packaged scorer inputs`,
      rescored.length === run.summaries.length && run.summaries.every((summary) =>
        figures(summary) === figures(rescored.find((entry) => entry.label === summary.label) ?? {})));
    check(`${name}: verdict equals all rescored gates and blocked coverage`,
      run.passed === (rescored.every((summary) => summary.passed) && run.actionPlan.blocked.length === 0));
    check(`${name}: no action is blocked or omitted`,
      run.actionPlan.blocked.length === 0 &&
      run.actionPlan.applicableLabels.length === (target.endsWith('native') ? 25 : 26) &&
      JSON.stringify(run.summaries.map((entry) => entry.label)) === JSON.stringify(run.actionPlan.applicableLabels));
    check(`${name}: canonical command groups include coloring in the target-specific order`,
      JSON.stringify(run.actionGroups) === JSON.stringify(target.endsWith('native') ? NATIVE_GROUPS : WEB_GROUPS));
    check(`${name}: first open and reopen are separate from the retired ambiguous open`,
      COLORING.every((label) => run.actionPlan.applicableLabels.includes(label)) &&
      !run.actionPlan.applicableLabels.includes('open coloring books'));
    check(`${name}: each action has one warmup and three scored repeats`,
      run.repeats === 4 && run.actionPlan.applicableLabels.every((label) => {
        const samples = run.samples.filter((sample) => sample.label === label);
        return samples.length === 4 && samples.map((sample) => sample.repeat).join() === '1,2,3,4' &&
          samples.map((sample) => sample.warmup).join() === 'true,false,false,false';
      }));
    check(`${name}: source hash records its private raw artifact`, /^[0-9a-f]{64}$/.test(run.sourceSha256));
    const arm = identity[armOf(capture)];
    if (target.endsWith('native')) {
      check(`${name}: every loaded entry is the archived ${armOf(capture)} app bundle and no other arm`,
        loadedOnlyArmEntry(run, arm[target].entry) && run.transport === 'native-capacitor-webview');
    } else {
      check(`${name}: served entry and digest match the archived ${armOf(capture)} web build`,
        run.buildEntry === arm.web.entry && run.buildDigest === arm.web.digest &&
        (target === 'macos' ? run.engine === 'webkit' && run.captureRuntime === 'desktop-playwright' :
          target === 'android-chrome' ? run.transport === 'android-chrome-cdp' : run.transport === 'browser'));
    }
    check(`${name}: OS, orientation, theme, runtime, input and cadence pin match the declared campaign controls`,
      matchesDeclaredControls(run, target));
    check(`${name}: AI finish ran in a secure context with one stubbed request`,
      run.samples.filter((sample) => sample.label === AI[1]).length === 4 &&
      run.samples.filter((sample) => sample.label === AI[1]).every((sample) =>
        sample.aiRun?.secureContext === true && sample.aiRun.requests === 1 &&
        sample.aiRun.generateCalls === 1 && sample.aiRun.urls?.every((url) => /\/api\/generate-image/.test(url))));
  }
}
check('capture order contains exactly the completed ABBA positions',
  JSON.stringify(order.map((entry) => entry.name)) === JSON.stringify(expected.filter((name) => runs.has(name))));
check('capture completion times increase strictly',
  order.every((entry, index) => Number.isFinite(Date.parse(entry.completedUtc)) &&
    (index === 0 || Date.parse(entry.completedUtc) > Date.parse(order[index - 1].completedUtc))));
check('capture order raw hashes and verdicts match every reduction',
  order.every((entry) => entry.rawSha256 === runs.get(entry.name)?.sourceSha256 &&
    entry.verdict === (runs.get(entry.name)?.passed ? 'pass' : 'red')));
for (const [, target, captures] of SETS) {
  const group = captures.map((capture) => runs.get(`${target}-${capture}`)).filter(Boolean);
  if (!group.length) continue;
  const controls = (entry) => JSON.stringify([
    entry.actionPlan.applicableLabels, entry.orientation, entry.theme, entry.device?.os,
    entry.captureRuntime, entry.uiActivation, entry.refreshRatePin, entry.gateAllowances,
  ]);
  check(`${target}: captured arms share action order and gate allowances`,
    group.every((entry) => controls(entry) === controls(group[0])));
}
console.log(`${runs.size} canonical captures, ${coverage.filter((entry) => entry.status === 'hole').length} explicit holes`);
if (failures.length) process.exit(1);
