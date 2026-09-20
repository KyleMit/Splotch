// Machine-checks this package's claims from its contents, never from a stored verdict.
//   node docs/scratchpad/perf/2026-09-19-animation-historical-r1/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ABBA, SETS, armOf, readRun, rescore, root, scoredMaxima, scoredSamples } from './lib.mjs';

const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
};
const SCORED_FIGURES = (summary) =>
  JSON.stringify([
    summary.label,
    summary.passed,
    summary.count,
    summary.totalCount,
    summary.activation,
    summary.firstFrame,
    summary.ready,
    { ...summary.frames },
    summary.frameSamples,
  ]);
const MAX_GATE_MS = 33.5;
const POST_P95_GATE_MS = 20;

const manifest = JSON.parse(read('MANIFEST.json'));
for (const { path, sha256 } of manifest.files) {
  const actual = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  check(`manifest hash matches ${path}`, actual === sha256);
}

const identity = JSON.parse(read('BUILD-IDENTITY.json'));
const FIRST = 'first open of coloring books';
const REOPEN = 'reopen coloring books';
const LEGACY_OPEN = 'open coloring books';
const AI_LABELS = ['show AI waiting print', 'finish AI waiting print'];
const NO_COLORING_LABELS = [
  'change ink color',
  'open custom color picker',
  'select custom color',
  'open brush menu',
  'select crayon brush',
  'select Magic brush',
  'select eraser',
  'select pen brush',
  'open stroke-width menu',
  'change stroke width',
  'open Settings',
  'close Settings',
  'save screenshot',
  ...AI_LABELS,
  'undo latest stroke',
  'tap unavailable undo',
  'clear drawing',
  'clear drawing on a coloring page',
];

const loaded = new Map();
for (const [directory, target, captures] of SETS) {
  for (const capture of captures) {
    const name = `${directory}/${target}.${capture}`;
    const run = readRun(directory, target, capture);
    loaded.set(name, run);
    const recomputed = rescore(run);
    check(
      `${name}: every stored summary is what the scorer at this checkout recomputes from the packaged samples`,
      recomputed.length === run.summaries.length &&
        run.summaries.every(
          (stored) =>
            SCORED_FIGURES(stored) ===
            SCORED_FIGURES(recomputed.find((summary) => summary.label === stored.label) ?? {})
        )
    );
    check(
      `${name}: the stored capture verdict is the conjunction of its rescored actions and its blocked coverage`,
      run.passed === (recomputed.every((summary) => summary.passed) && run.actionPlan.blocked.length === 0)
    );
    check(
      `${name}: every applicable action ran in one warmup (repeat 1) plus three scored repeats`,
      run.actionPlan.applicableLabels.every((label) => {
        const samples = run.samples.filter((sample) => sample.label === label);
        return (
          samples.length === 4 &&
          samples.map((sample) => sample.repeat).join() === '1,2,3,4' &&
          samples.filter((sample) => sample.warmup).length === 1 &&
          samples[0].warmup === true
        );
      })
    );
    check(
      `${name}: no sample carries either first-open or reopen label, so nothing here can be read as one`,
      run.samples.every((sample) => sample.label !== FIRST && sample.label !== REOPEN)
    );
  }
}
const run = (name) => loaded.get(name);

for (const [directory, target, captures] of SETS) {
  const runs = captures.map((capture) => run(`${directory}/${target}.${capture}`));
  const key = (entry) =>
    JSON.stringify([
      entry.actionPlan.applicableLabels,
      entry.orientation ?? null,
      entry.theme ?? null,
      entry.device?.os ?? null,
      entry.captureRuntime ?? null,
      entry.refreshRatePin ?? null,
      entry.gateAllowances ?? null,
    ]);
  check(
    `${directory}/${target}: both arms ran the same ordered actions under the same orientation, theme, OS, runtime, refresh pin and allowances`,
    runs.every((entry) => key(entry) === key(runs[0]))
  );
}

// New captures on the frozen harness.
for (const capture of ['before', 'after']) {
  const entry = run(`runs/macos-web-pilot.${capture}`);
  check(
    `runs/macos-web-pilot.${capture}: idle control plus the 19 non-coloring actions, none blocked, headed WebKit, served from the ${capture} preview port`,
    JSON.stringify(entry.actionPlan.applicableLabels) ===
      JSON.stringify(['idle frame control', ...NO_COLORING_LABELS]) &&
      entry.actionPlan.blocked.length === 0 &&
      entry.engine === 'webkit' &&
      entry.appUrl === `http://<host>:${capture === 'before' ? 54834 : 54835}/` &&
      entry.passed === true
  );
}
for (const capture of ABBA) {
  const chrome = run(`runs/android-chrome.${capture}`);
  const arm = identity[armOf(capture)];
  check(
    `runs/android-chrome.${capture}: exactly the idle control plus the 19 non-coloring actions, in samples and summaries as well as the plan`,
    [
      chrome.actionPlan.applicableLabels,
      [...new Set(chrome.samples.map((sample) => sample.label))],
      chrome.summaries.map((summary) => summary.label),
    ].every(
      (labels) => JSON.stringify(labels) === JSON.stringify(['idle frame control', ...NO_COLORING_LABELS])
    )
  );
  check(
    `runs/android-chrome.${capture}: the artifact's own served entry and build digest are the ${armOf(capture)} build's, reached as localhost`,
    chrome.buildEntry === arm.webBuild.servedEntry &&
      chrome.buildDigest === arm.webBuild.servedBuildDigest &&
      /^http:\/\/<host>:5483[45]\/$/.test(chrome.appUrl)
  );
  check(
    `runs/android-chrome.${capture}: both AI waiting actions ran unblocked, and every finish sample proves a secure context with exactly one stubbed generate request`,
    chrome.actionPlan.blocked.length === 0 &&
      AI_LABELS.every((label) => chrome.actionPlan.applicableLabels.includes(label)) &&
      chrome.samples
        .filter((sample) => sample.label === 'finish AI waiting print')
        .every(
          (sample) =>
            sample.aiRun?.secureContext === true &&
            sample.aiRun.randomUUID === 'function' &&
            sample.aiRun.requests === 1 &&
            sample.aiRun.generateCalls === 1 &&
            sample.aiRun.urls.every((url) => url.startsWith('/api/generate-image')) &&
            /^http:\/\/localhost:5483[45]$/.test(sample.aiRun.origin)
        )
  );
  const native = run(`runs/ipad-native.${capture}`);
  check(
    `runs/ipad-native.${capture}: the bundled Capacitor WebView in landscape, the 19 non-coloring actions, none blocked`,
    native.transport === 'native-capacitor-webview' &&
      native.appUrl === 'capacitor://<host>' &&
      native.orientation === 'LANDSCAPE' &&
      JSON.stringify(native.actionPlan.applicableLabels) === JSON.stringify(NO_COLORING_LABELS) &&
      native.actionPlan.blocked.length === 0
  );
}
check(
  'BUILD-IDENTITY: the two arms are different builds of the two named commits, both clean',
  identity.before.commit === 'a9b633c4392de7ca943d3f927ff86686956cdb83' &&
    identity.after.commit === '751093de306f08f771f52f85996f55838b7b0d15' &&
    identity.before.webBuild.provenance.commit === identity.before.commit &&
    identity.after.webBuild.provenance.commit === identity.after.commit &&
    !identity.before.webBuild.provenance.dirty &&
    !identity.after.webBuild.provenance.dirty &&
    identity.before.webBuild.servedBuildDigest !== identity.after.webBuild.servedBuildDigest &&
    identity.before.ipadApp.publicTreeListingSha256 !== identity.after.ipadApp.publicTreeListingSha256
);

// Descriptive findings, re-derived from the raw scored gaps.
const breaches = (name, label) => scoredMaxima(run(name), label).filter((max) => max > MAX_GATE_MS).length;
const failedLabels = (name) =>
  rescore(run(name))
    .filter((summary) => !summary.passed)
    .map((summary) => summary.label);
check(
  'ipad-native: `clear drawing on a coloring page` is red in all four captures, both arms, each with at least two scored maxima over 33.5 ms',
  ABBA.every(
    (capture) =>
      failedLabels(`runs/ipad-native.${capture}`).includes('clear drawing on a coloring page') &&
      breaches(`runs/ipad-native.${capture}`, 'clear drawing on a coloring page') >= 2
  )
);
check(
  'ipad-native: `select Magic brush` shows a roughly 80 ms scored gap in both arms (2 of 6 scored before, 5 of 6 after), so it is red only in the two after captures',
  JSON.stringify(ABBA.map((capture) => breaches(`runs/ipad-native.${capture}`, 'select Magic brush'))) ===
    '[1,2,3,1]' &&
    ABBA.every((capture) =>
      scoredMaxima(run(`runs/ipad-native.${capture}`), 'select Magic brush').every(
        (max) => max <= 20 || (max >= 70 && max <= 90)
      )
    ) &&
    ABBA.every(
      (capture) =>
        failedLabels(`runs/ipad-native.${capture}`).includes('select Magic brush') ===
        (armOf(capture) === 'after')
    )
);
check(
  'ipad-native: nothing else is red in any capture, and both AI waiting actions pass in all four with every scored maximum at or under 23 ms',
  ABBA.every(
    (capture) =>
      failedLabels(`runs/ipad-native.${capture}`).every((label) =>
        ['select Magic brush', 'clear drawing on a coloring page'].includes(label)
      ) &&
      AI_LABELS.every((label) =>
        scoredMaxima(run(`runs/ipad-native.${capture}`), label).every((max) => max <= 23)
      )
  )
);
check(
  'android-chrome: `clear drawing on a coloring page` is the only red action, red in before-1, after-2 and before-2 (post P95 over 20 ms) and passing in after-1',
  JSON.stringify(ABBA.map((capture) => failedLabels(`runs/android-chrome.${capture}`))) ===
    JSON.stringify([
      ['clear drawing on a coloring page'],
      [],
      ['clear drawing on a coloring page'],
      ['clear drawing on a coloring page'],
    ]) &&
    ABBA.every((capture) => {
      const summary = rescore(run(`runs/android-chrome.${capture}`)).find(
        (entry) => entry.label === 'clear drawing on a coloring page'
      );
      return capture === 'after-1'
        ? summary.frames.p95 <= POST_P95_GATE_MS
        : summary.frames.p95 > POST_P95_GATE_MS && summary.firstFrame.p95 <= MAX_GATE_MS;
    })
);
check(
  'android-chrome: no scored AI waiting gap exceeds 33.5 ms in either arm',
  ABBA.every((capture) =>
    AI_LABELS.every((label) => breaches(`runs/android-chrome.${capture}`, label) === 0)
  )
);

// Reused overnight captures.
for (const target of ['macos-web.r2', 'android-web.r2', 'android-native.r2']) {
  check(
    `reused/${target}: every rescored action passes in all four captures`,
    ABBA.every((capture) => failedLabels(`reused/${target}.${capture}`).length === 0)
  );
}
check(
  'reused/android-web.r2: each capture is red only through blocked coverage: both AI waiting actions, on an insecure LAN origin with zero requests',
  ABBA.every((capture) => {
    const entry = run(`reused/android-web.r2.${capture}`);
    return (
      entry.passed === false &&
      JSON.stringify(entry.actionPlan.blocked.map((blocked) => blocked.label)) === JSON.stringify(AI_LABELS) &&
      entry.actionPlan.blocked.every((blocked) => /\\?"secureContext\\?":false/.test(blocked.reason)) &&
      entry.samples.every((sample) => !AI_LABELS.includes(sample.label))
    );
  })
);
check(
  'reused/android-web.r2: it alone ran the legacy coloring sequence, whose open carries only the retired ambiguous label; the other two reused targets carry no coloring-picker action at all',
  ABBA.every(
    (capture) =>
      scoredSamples(run(`reused/android-web.r2.${capture}`), LEGACY_OPEN).length === 3 &&
      run(`reused/android-web.r2.${capture}`).actionGroups.includes('coloring') &&
      ['macos-web.r2', 'android-native.r2'].every(
        (target) => !run(`reused/${target}.${capture}`).actionGroups.includes('coloring')
      ) &&
      ['macos-web.r2', 'android-native.r2'].every((target) =>
        run(`reused/${target}.${capture}`).samples.every(
          (sample) => sample.label !== LEGACY_OPEN && sample.label !== 'open coloring book'
        )
      )
  )
);
check(
  'reused: the overnight artifacts carry no product commit, served entry or build digest of their own',
  ['macos-web.r2', 'android-web.r2', 'android-native.r2'].every((target) =>
    ABBA.every((capture) => {
      const entry = run(`reused/${target}.${capture}`);
      return !entry.productCommit && !entry.buildEntry && !entry.buildDigest;
    })
  )
);

// Historical incompatibilities of the frozen harness, preserved as they failed.
const p1 = read('pilots/p1-macos-web-before-with-coloring.console.txt');
check(
  'p1: with `coloring` in the plan the desktop capture of the before build stopped at the 240 s install bound reading 0 of 7 books, and wrote no artifact',
  /Timed out after 240 s waiting for coloring books to install: 0 of 7 extra books installed, missing dinosaur, creatures, nature, objects, shapes, space, vehicles/.test(p1) &&
    p1.includes('--url=http://127.0.0.1:54834/') &&
    !p1.includes('Wrote ')
);
for (const [arm, version] of [
  ['before', '1.6.269'],
  ['after', '1.6.273'],
]) {
  const probe = JSON.parse(read(`pilots/d1-legacy-marker-probe.${arm}.txt`).trim().split('\n').at(-1));
  check(
    `d1 ${arm}: the same build holds all seven books, each under the versioned marker path the frozen reader does not parse`,
    probe.markerCount === 7 &&
      JSON.stringify(probe.caches) === JSON.stringify([`coloring-packs-v1-${version}-full`]) &&
      probe.markers.every((marker) => marker.startsWith(`/coloring/.installed/${version}/full/`))
  );
}
const p2 = read('pilots/p2-ipad-native-before-with-coloring.console.txt');
check(
  'p2: on the iPad native before build the first-open guard refused a never-opened picker that already renders tiles, in sweep 1, and wrote no artifact',
  /Action sweep 1\/4\nError: The coloring picker already holds 3 rendered tiles/.test(p2) &&
    !p2.includes('Action sweep 2/4') &&
    !p2.includes('Wrote ')
);
const p4 = read('pilots/p4-android-native-before-with-coloring.console.txt');
check(
  'p4: on the Android native before build the first-open guard refused a never-opened picker that already renders tiles, in sweep 1, and wrote no artifact',
  /Action sweep 1\/4\nError: The coloring picker already holds 6 rendered tiles/.test(p4) &&
    p4.includes('--native-webview-class=android.webkit.WebView') &&
    !p4.includes('Action sweep 2/4') &&
    !p4.includes('Wrote ')
);
for (const capture of ABBA) {
  const refused = read(`pilots/p3-ipad-safari-${capture}-refused.console.txt`);
  const arm = identity[armOf(capture)];
  check(
    `p3 ${capture}: the iPad action runner refused the ${armOf(capture)} preview as a build its checkout does not contain, before any session`,
    refused.includes(`is serving ${arm.webBuild.servedEntry}, which this checkout's web/build does not contain`) &&
      !refused.includes('Action sweep') &&
      !refused.includes('Wrote ')
  );
}

if (failures.length) {
  console.error(`\n${failures.length} claim(s) failed`);
  process.exit(1);
}
console.log('\nall claims hold');
