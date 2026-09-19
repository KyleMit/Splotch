// Machine-checks this package's claims. Run: node docs/scratchpad/perf/2026-09-19-coloring-first-open/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
};

const manifest = JSON.parse(read('MANIFEST.json'));
for (const { path, sha256 } of manifest.files) {
  const actual = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  check(`manifest hash matches ${path}`, actual === sha256);
}

const FIRST = 'first open of coloring books';
const REOPEN = 'reopen coloring books';
const FLOW = [FIRST, REOPEN, 'open coloring book', 'scroll coloring pages', 'select coloring page', 'clear coloring page'];
const RUNS = [
  ['d1-chromium-coloring', { labels: 6, webPacks: true }],
  ['d2-webkit-full-groups', { labels: 26, webPacks: true }],
  ['a3-android-chrome-full-groups', { labels: 26, webPacks: true }],
  ['i1-ipad-safari-full-groups', { labels: 26, webPacks: true, nativeTouchScroll: true }],
  ['i2-ipad-native-full-groups', { labels: 25, webPacks: false, nativeTouchScroll: true }],
];

for (const [name, expected] of RUNS) {
  const run = JSON.parse(read(`runs/${name}.actions.reduced.json`));
  const log = read(`runs/${name}.console.txt`);
  check(`${name}: the capture command exited 0 and the artifact passed`, /^exit=0$/m.test(log) && run.passed === true);
  check(`${name}: ${expected.labels} applicable actions, none blocked or not applicable`, run.actionPlan.applicableLabels.length === expected.labels && run.actionPlan.blocked.length === 0 && run.actionPlan.notApplicable.length === 0);
  check(`${name}: every coloring action ran in one warmup plus three scored repeats`, FLOW.every((label) => {
    const samples = run.samples.filter((sample) => sample.label === label);
    return samples.length === 4 && samples.filter((sample) => sample.warmup).length === 1 && samples.find((sample) => sample.warmup).repeat === 1;
  }));
  check(`${name}: no sample carries the retired 'open coloring books' label`, run.samples.every((sample) => sample.label !== 'open coloring books'));
  check(`${name}: in every repeat the first open was recorded before the reopen`, [1, 2, 3, 4].every((repeat) => {
    const order = run.samples.filter((sample) => sample.repeat === repeat).map((sample) => sample.label);
    return order.indexOf(FIRST) !== -1 && order.indexOf(FIRST) < order.indexOf(REOPEN) && order.indexOf(REOPEN) < order.indexOf('open coloring book');
  }));
  if (expected.webPacks) {
    check(`${name}: every repeat prepared 8 listed books in one document and swept in the next`, run.coloringPreparation.length === 4 && run.coloringPreparation.every((entry) => entry.listedColoringBooks === 8 && entry.documentLoads === 2 && entry.preparationMs > 0) && run.actionPlan.context.listedColoringBooks === 8);
    check(`${name}: repeat 1 paid the install inside the 240 s bound and later repeats met installed books`, run.coloringPreparation[0].preparationMs < 240_000 && run.coloringPreparation.slice(1).every((entry) => entry.preparationMs < 10_000));
  } else {
    check(`${name}: a native shell keeps no web pack storage, so nothing prepared and the sweep ran in the one document`, run.coloringPreparation.every((entry) => entry.listedColoringBooks === null && entry.preparationMs === null && entry.documentLoads === 1));
  }
  if (expected.nativeTouchScroll) {
    const scrolls = run.samples.filter((sample) => sample.label === 'scroll coloring pages');
    check(`${name}: every page scroll began with one trusted native pointerdown on the picker gutter, off the centre column`, scrolls.every((sample) => sample.activation === 'native-touch' && sample.trusted === true && sample.armedEvents.length === 1 && sample.armedEvents[0].type === 'pointerdown' && sample.armedEvents[0].trusted === true && sample.armedEvents[0].hit === 'DIV'));
    check(`${name}: every page scroll moved the grid (the sample exists only once scrollTop changed) and passed`, run.summaries.find((summary) => summary.label === 'scroll coloring pages').passed === true);
  }
}

const chromium = JSON.parse(read('runs/d1-chromium-coloring.actions.reduced.json'));
const ready = (label) => chromium.samples.filter((sample) => sample.label === label).map((sample) => sample.readyMs);
check('d1: on desktop Chromium every first open became ready later than every reopen (2.0 to 3.3 ms against 1.1 to 1.3 ms)', Math.min(...ready(FIRST)) > Math.max(...ready(REOPEN)));

const negative = read('controls/n1-sweep-in-preparation-document.console.txt');
check('n1: a sweep run in the preparation document is refused before its first measured coloring action', /Error: The coloring picker already holds 8 rendered tiles, so it has opened in this document and its next open is not a first open/.test(negative) && /^exit=1$/m.test(negative) && !negative.includes('Wrote '));
check('n1: the control patch only removes the fresh document load', read('controls/n1-sweep-in-preparation-document.patch.txt').split('\n').filter((line) => /^[-+] /.test(line)).join('|') === '-  await loadDocument();|+  // NEGATIVE CONTROL ONLY (never committed): sweep in the preparation document.');
const preChange = read('controls/n2-new-tests-against-prechange-harness.txt');
check('n2: against the pre-change sweep and runners, exactly the five placement tests fail', (preChange.match(/^\s+× /gm) ?? []).length === 5 && /Tests\s+5 failed \| 30 passed/.test(preChange));

for (const stalled of ['a1-full-groups-no-pump', 'a2-coloring-poll-5s-no-pump']) {
  check(`${stalled}: without frames the phone installed one book and hit the 240 s bound by name`, /Timed out after 240 s waiting for coloring books to install: 1 of 7 extra books installed, missing creatures, nature, objects, shapes, space, vehicles/.test(read(`android-install-stall/${stalled}.console.txt`)));
}
const still = read('android-install-stall/a0d-android-install-probe-locks.console.txt');
check('a0d: the stalled page held no lock and no pending fetch, on an allowed connection', (still.match(/missing=6 .*"type":"wifi","effectiveType":"4g".*"saveData":false/g) ?? []).length >= 5 && (still.match(/locks \{"held":\[\],"pending":\[\]\} pending fetches 0/g) ?? []).length >= 5);
const framed = read('android-install-stall/a0e-android-install-probe-idle.console.txt');
check('a0e: the same page finished the catalog within 21 s once the probe requested frames', /^21s missing=0 /m.test(framed) && /^5s missing=6 /m.test(framed));

if (failures.length) {
  console.error(`\n${failures.length} claim(s) failed`);
  process.exit(1);
}
console.log('\nall claims hold');
