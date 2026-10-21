import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt',
  out = `${root}/evidence`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const read = (name) =>
  existsSync(`${out}/${name}`) ? JSON.parse(readFileSync(`${out}/${name}`)) : null;
const rows = JSON.parse(readFileSync(`${root}/results/case-ledger.json`)).map((r) => ({
  ...r,
  device: 'emulator-5680',
  period: 'first-run',
}));
function add(file, entries, device = 'emulator-5680', kind = 'functional') {
  for (const [index, row] of (entries ?? []).entries()) {
    let status = row.status;
    if (!status && row.widths?.every((n, i, a) => n > 0 && (!i || n > a[i - 1]))) status = 'pass';
    rows.push({
      id: `${file.replace('.json', '')}:${row.case ?? row.id ?? index}`,
      device,
      period: 'second-run',
      kind,
      status: status ?? 'unreviewed',
      details: row,
      evidence: [`evidence/${file}`],
      commit,
    });
  }
}
const drawing = read('android-run2-drawing-verified.json');
add(
  'android-run2-drawing-verified.json',
  drawing?.filter((r) => !r.case.startsWith('magic-clean-') && r.case !== 'edge-crossings')
);
for (const file of ['drawing-extra', 'picker', 'sliders', 'pen-pair', 'save']) {
  const name = `android-run2-${file}-results.json`,
    data = read(name);
  add(name, data?.checks ?? data);
}
for (const file of [
  'orientation',
  'parent',
  'network',
  'keys',
  'ai-preferences',
  'brush-combinations',
]) {
  const name = `android-run2-${file}-results.json`,
    data = read(name);
  add(name, data?.checks ?? data);
}
const magic = read('android-run2-magic-corrected-verdict.json');
add(
  'android-run2-magic-corrected-verdict.json',
  magic?.results?.map((r) => ({ ...r, case: `corrected-continuity-${r.run}` }))
);
const monkey = read('android-run2-monkey-summary.json');
add(
  'android-run2-monkey-summary.json',
  monkey?.results?.map((r) => ({
    case: `monkey-seed-${r.seed}`,
    status:
      r.eventsInjected === 3000 && r.verdict === 'alive' && !r.scenarioError
        ? 'pass'
        : 'needs-review',
    seed: r.seed,
    eventsInjected: r.eventsInjected,
    verdict: r.verdict,
    scenarioError: r.scenarioError,
    logcatCoverage: monkey.logcatCoverage?.status ?? 'readable',
  })),
  'emulator-5680',
  'robustness'
);
const verifiedMonkey = read('android-run2-monkey-verified-summary.json');
add(
  'android-run2-monkey-verified-summary.json',
  verifiedMonkey?.results?.map((row) => ({
    case: `verified-monkey-seed-${row.seed}`,
    status:
      row.eventsInjected === 3000 &&
      row.verdict === 'alive' &&
      !row.scenarioError &&
      row.rawLogcatRead?.exit === 0
        ? 'pass'
        : 'needs-review',
    seed: row.seed,
    eventsInjected: row.eventsInjected,
    verdict: row.verdict,
    scenarioError: row.scenarioError,
    rawLogcatRead: row.rawLogcatRead,
  })),
  'emulator-5680',
  'robustness'
);
const life = read('android-run2-lifecycle-summary.json');
const lifeCorrection = read('android-run2-lifecycle-corrected-summary.json');
const lifeResults = life?.results?.map((original) => {
  const corrected = lifeCorrection?.results?.find(
    (row) => row.scenario === original.scenario && row.run === original.run
  );
  return {
    ...(corrected ?? original),
    sourceFile: corrected
      ? 'android-run2-lifecycle-corrected-summary.json'
      : 'android-run2-lifecycle-summary.json',
  };
});
if (lifeResults)
  writeFileSync(
    `${out}/android-run2-lifecycle-reviewed-results.json`,
    JSON.stringify(
      {
        device: 'emulator-5680',
        results: lifeResults,
        originalBatch: 'android-run2-lifecycle-summary.json',
        correctionBatch: lifeCorrection ? 'android-run2-lifecycle-corrected-summary.json' : null,
      },
      null,
      2
    ) + '\n'
  );
add(
  'android-run2-lifecycle-reviewed-results.json',
  lifeResults?.map((r) => ({
    case: `${r.scenario}-${r.run}`,
    status: r.verdict === 'alive' && !r.scenarioError ? 'pass' : 'needs-review',
    verdict: r.verdict,
    scenarioError: r.scenarioError,
    sourceFile: r.sourceFile,
  })),
  'emulator-5680',
  'robustness'
);
const long = read('android-run2-long-session.json');
if (long)
  add(
    'android-run2-long-session.json',
    [
      {
        case: '2000-stroke-session',
        status:
          long.batches.length === 10 && !long.scenarioError && long.verdict === 'alive'
            ? 'pass'
            : 'needs-review',
        verdict: long.verdict,
        requestedStrokes: long.requestedStrokes,
        completedBatches: long.batches.length,
      },
    ],
    'emulator-5680',
    'robustness'
  );
const warmLong = read('android-run2-warm-long-session.json');
if (warmLong)
  add(
    'android-run2-warm-long-session.json',
    [
      {
        case: 'same-PID-2000-stroke-warm-repeat',
        status:
          warmLong.completedStrokes === 2000 &&
          !warmLong.scenarioError &&
          warmLong.verdict === 'alive'
            ? 'pass'
            : 'needs-review',
        verdict: warmLong.verdict,
        retention: warmLong.retention,
        matchedPaper: warmLong.matchedWarmPaper,
      },
    ],
    'emulator-5680',
    'robustness'
  );
const pressure = read('android-run2-memory-pressure-results.json');
if (pressure)
  add(
    'android-run2-memory-pressure-results.json',
    [
      {
        case: 'memory-pressure-after-warm-repeat',
        status:
          pressure.verdict === 'alive' && !pressure.scenarioError
            ? pressure.commandError
              ? 'blocked'
              : 'pass'
            : 'needs-review',
        verdict: pressure.verdict,
        commandError: pressure.commandError,
        scenarioError: pressure.scenarioError,
      },
    ],
    'emulator-5680',
    'diagnostic-memory'
  );
for (const device of ['emulator-5682', 'emulator-5684']) {
  const name = `android-run2-${device}-core-results.json`;
  add(name, read(name)?.checks, device);
}
for (const phase of ['layout', 'rotation-continuous']) {
  const name = `android-run2-emulator-5682-${phase}-results.json`;
  add(name, read(name)?.checks, 'emulator-5682');
}
for (const phase of [
  'legacy-save',
  'real-allow',
  'kernel',
  'export-fidelity',
  'autosave-fidelity',
]) {
  const name = `android-run2-emulator-5684-${phase}-results.json`;
  add(name, read(name)?.checks, 'emulator-5684');
}
const five = read('android-run2-emulator-5684-five-results.json');
const eraserCorrection = read('android-run2-emulator-5684-five-eraser-corrected-results.json');
if (five) {
  const checks = five.checks.map((original) => {
    const corrected = eraserCorrection?.checks.find((row) => row.id === original.id);
    return {
      ...(corrected ?? original),
      sourceFile: corrected
        ? 'android-run2-emulator-5684-five-eraser-corrected-results.json'
        : 'android-run2-emulator-5684-five-results.json',
    };
  });
  writeFileSync(
    `${out}/android-run2-emulator-5684-five-reviewed-results.json`,
    JSON.stringify(
      {
        device: 'emulator-5684',
        checks,
        rawSetupArtifact:
          'Original Eraser takes use the Pen label Size 3; corrected takes select Eraser size 3 before input.',
      },
      null,
      2
    ) + '\n'
  );
  add('android-run2-emulator-5684-five-reviewed-results.json', checks, 'emulator-5684');
}
const fontLayout = read('android-run2-emulator-5684-font2-results.json');
const parentLayout = read('android-run2-emulator-5684-font2-parent-corrected-results.json');
if (fontLayout) {
  const checks = fontLayout.checks.map((original) => {
    const corrected = parentLayout?.checks.find((row) => row.id === original.id);
    return {
      ...(corrected ?? original),
      sourceFile: corrected
        ? 'android-run2-emulator-5684-font2-parent-corrected-results.json'
        : 'android-run2-emulator-5684-font2-results.json',
    };
  });
  writeFileSync(
    `${out}/android-run2-emulator-5684-font2-reviewed-results.json`,
    JSON.stringify(
      {
        device: 'emulator-5684',
        checks,
        unconfirmedObservation:
          'The original single font-2 hardware-key gate attempt left the answer empty. The touch-keypad repeat validates the section Close goal; no keyboard finding is filed from one attempt.',
      },
      null,
      2
    ) + '\n'
  );
  add('android-run2-emulator-5684-font2-reviewed-results.json', checks, 'emulator-5684');
}
const api28Life = read('android-run2-emulator-5684-life-reviewed-results.json');
add(
  'android-run2-emulator-5684-life-reviewed-results.json',
  api28Life?.checks,
  'emulator-5684',
  'robustness'
);
const api28Long = read('android-run2-emulator-5684-long-results.json');
if (api28Long)
  add(
    'android-run2-emulator-5684-long-results.json',
    [
      {
        case: '2000-stroke-session',
        status:
          api28Long.completedStrokes === 2000 &&
          !api28Long.scenarioError &&
          api28Long.verdict === 'alive'
            ? 'pass'
            : 'needs-review',
        verdict: api28Long.verdict,
        completedStrokes: api28Long.completedStrokes,
        retainedGrowthKb: api28Long.retention.retainedGrowthKb,
        memoryObservation: 'Flagged for review, not a reproduced finding',
      },
    ],
    'emulator-5684',
    'robustness'
  );
const counts = {};
for (const device of ['emulator-5680', 'emulator-5682', 'emulator-5684']) {
  counts[device] = {};
  for (const row of rows.filter((r) => r.device === device))
    counts[device][row.status] = (counts[device][row.status] ?? 0) + 1;
}
writeFileSync(
  `${root}/results/android-device-ledger.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), commit, counts, rows }, null, 2) + '\n'
);
console.log(counts);
