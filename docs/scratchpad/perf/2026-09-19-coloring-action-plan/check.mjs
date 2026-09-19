// Re-derives this package's machine-checked claims from the packaged files,
// verifies every file against MANIFEST.json, and scans every packaged byte with
// the repo's device-identifier guard. Exits non-zero on any failure. README.md
// names the claims that are operator-observed and the ones left unsupported.
//   node docs/scratchpad/perf/2026-09-19-coloring-action-plan/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { scanForDeviceIdentifiers } from '../../../../tools/perf/lib/device-identifiers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} machine-checked: ${claim}`);
  if (!ok) failures.push(claim);
};

for (const entry of JSON.parse(readFileSync(join(HERE, 'MANIFEST.json'), 'utf8'))) {
  const bytes = readFileSync(join(HERE, entry.path));
  check(
    `manifest hash ${entry.path}`,
    createHash('sha256').update(bytes).digest('hex') === entry.sha256
  );
  const text = entry.path.endsWith('.gz')
    ? gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8');
  check(
    `no device identifier, LAN address or home path in ${entry.path}`,
    scanForDeviceIdentifiers(text).length === 0 &&
      !/\b192\.168\.\d+\.\d+\b/.test(text) &&
      !text.includes('/Users/')
  );
}

const run = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', `${name}.json.gz`))));
const control = (name) => readFileSync(join(HERE, 'controls', name), 'utf8');
const probe = (name) => JSON.parse(readFileSync(join(HERE, 'probes', name), 'utf8'));
const BOOK_STEP = 'open coloring book';
const ABORT = `The applicable action plan changed between scored repeats: +${BOOK_STEP}`;

const f1 = control('f1-prefix-full-groups-abort.console.txt');
check('f1: the pre-fix full-group capture aborts on the plan change', f1.includes(ABORT));
check(
  'f1: it aborts after sweep 2 and never starts sweep 3',
  f1.includes('Desktop action sweep 2/4') && !f1.includes('Desktop action sweep 3/4')
);

const f2 = control('f2-prefix-full-groups-instrumented.console.txt');
const pickers = [...f2.matchAll(/^\[diag picker\] (.+)$/gm)].map((match) => JSON.parse(match[1]));
check('f2: the instrumented pre-fix capture aborts the same way', f2.includes(ABORT));
check(
  'f2: sweep 1 opens a one-book picker with no service worker in control',
  pickers[0]?.books === 0 && pickers[0]?.pages === 6 && pickers[0]?.sw === false
);
check(
  'f2: sweep 2 opens a three-book picker under a controlling service worker',
  pickers.length === 2 && pickers[1].books === 3 && pickers[1].pages === 0 && pickers[1].sw === true
);

const f0 = run('f0-prefix-coloring-only');
check(
  'f0: a pre-fix coloring-only capture passes while never meeting a book choice',
  f0.passed === true && !f0.actionPlan.applicableLabels.includes(BOOK_STEP)
);

const timeline = probe('pack-timeline-main.json').phases;
check(
  'pack-timeline: a fresh context holds no pack cache through 12 s without input',
  timeline.freshIdleBeforeAnyInput.length === 5 &&
    timeline.freshIdleBeforeAnyInput.every((sample) => sample.caches.length === 0)
);
check(
  'pack-timeline: the first picker open drills into the one starter book',
  timeline.firstPickerOpen.view.bookButtons === 0 && timeline.firstPickerOpen.view.pageButtons === 6
);
const markerSteps = timeline.afterEngagementTimeline.filter((step) => step.markers.length > 0);
check(
  'pack-timeline: after that open, books install one at a time, 15-17 s apart',
  markerSteps.length === 5 &&
    markerSteps.every((step, index) => step.markers.length === index + 1) &&
    markerSteps.slice(1).every((step, index) => {
      const gap = step.sinceEngagementMs - markerSteps[index].sinceEngagementMs;
      return gap > 15_000 && gap < 17_000;
    })
);
check(
  'pack-timeline: reopened on the same page, the picker lists the starter plus every installed book',
  timeline.samePageReopen.view.bookButtons === timeline.samePageReopen.state.markers.length + 1
);
check(
  'pack-timeline: a reload of that ephemeral WebKit context keeps the cache name and none of its 421 entries',
  timeline.samePageReopen.state.entries === 421 &&
    timeline.reloadAfterSettle500.state.caches.length === 1 &&
    timeline.reloadAfterSettle500.state.entries === 0 &&
    timeline.reloadAfter5s.view.bookButtons === 0
);

const kept = (record) => [record.beforeReload, record.atCommit, record.after5s].map((caches) => caches['control-not-a-pack']).join(',');
check(
  'reload-cache-control: ephemeral WebKit drops an app-unrelated cache entry on reload',
  kept(probe('reload-cache-control-webkit.json')) === '1,0,0'
);
check(
  'reload-cache-control: ephemeral Chromium keeps it',
  kept(probe('reload-cache-control-chromium.json')) === '1,1,1'
);
const persistent = probe('reload-cache-control-webkit-persistent.json');
check(
  'reload-cache-control: a persistent WebKit profile keeps it',
  persistent.persistent === true && kept(persistent) === '1,1,1'
);

const postReload = probe('post-reload-timeline-webkit.json');
check(
  'post-reload-timeline: the reloaded ephemeral WebKit page stores nothing for 140 s and lists one book',
  postReload.reloadTimeline.every((step) => step.entries === 0) &&
    postReload.reloadTimelineAfterPickerOpen.every((step) => step.entries === 0) &&
    postReload.reloadPickerAtEnd.books === 0 &&
    postReload.reloadPickerAtEnd.pages === 6
);
check(
  'post-reload-timeline: the product reports the failed install',
  postReload.console.some((line) => line.includes('Coloring pack changed while installing'))
);
const unobserved = probe('reload-without-cache-reads-webkit.json');
check(
  'reload-without-cache-reads: the same holds when the probe never reads Cache Storage first',
  unobserved.freshSamePageAfter40s.books === 3 &&
    unobserved.reloadAfter65s.books === 0 &&
    unobserved.cachesAtEnd['coloring-packs-v2-full'] === 0
);

const COLORING_LABELS = [
  'open coloring books',
  BOOK_STEP,
  'scroll coloring pages',
  'select coloring page',
  'clear coloring page',
];
const coversRepeats = (artifact, label) => {
  const samples = artifact.samples.filter((sample) => sample.label === label);
  return (
    samples.map((sample) => sample.repeat).join(',') === '1,2,3,4' &&
    samples.map((sample) => sample.warmup).join(',') === 'true,false,false,false'
  );
};
for (const [name, engine, groupCount] of [
  ['p1-postfix-webkit-coloring', 'webkit', 1],
  ['p2-postfix-webkit-full-groups', 'webkit', 12],
  ['p3-postfix-chromium-coloring', 'chromium', 1],
]) {
  const artifact = run(name);
  check(
    `${name}: ${engine}, ${groupCount} action group(s), passed with nothing blocked or not applicable`,
    artifact.engine === engine &&
      artifact.actions.length === groupCount &&
      artifact.passed === true &&
      artifact.actionPlan.blocked.length === 0 &&
      artifact.actionPlan.notApplicable.length === 0
  );
  check(
    `${name}: every sweep met a picker listing 8 books`,
    artifact.actionPlan.context.listedColoringBooks === 8
  );
  for (const label of COLORING_LABELS) {
    check(`${name}: ${label} ran repeats 1-4, repeat 1 the warmup`, coversRepeats(artifact, label));
  }
  check(
    `${name}: the page scroll was a trusted wheel that moved the grid`,
    artifact.samples
      .filter((sample) => sample.label === 'scroll coloring pages')
      .every((sample) => sample.activation === 'trusted-wheel' && sample.trusted !== false)
  );
}

const n1 = control('n1-new-tests-against-prefix-harness.txt');
check(
  'n1: against the pre-fix sweep and runner, exactly the three placement tests fail',
  n1.includes('3 failed | 13 passed (16)') &&
    n1.includes('× settles them before the first measured action of a sweep') &&
    n1.includes('× records the listed book count in the plan context') &&
    n1.includes('× gives the desktop capture a browser profile')
);

if (failures.length > 0) {
  console.error(`\n${failures.length} claim(s) failed`);
  process.exit(1);
}
console.log('\nAll machine-checked claims hold');
