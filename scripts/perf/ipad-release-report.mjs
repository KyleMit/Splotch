import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../lib/html.mjs';
import { masthead, page, siteFooter } from '../lib/scrapbook-chrome.mjs';

export const MIN_RELEASE_RIG_REPEATS = 3;
export const IPAD_RELEASE_SUITES = {
  fast: ['multi-finger', 'crayon-scribbles'],
  full: ['long-squiggles', 'multi-finger', 'crayon-squiggles', 'crayon-scribbles'],
};
const PUBLIC_RIG_LABEL = 'Splotch release iPad';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function validateReleaseRigInputs({ suite, repeats }) {
  if (!Object.hasOwn(IPAD_RELEASE_SUITES, suite)) {
    throw new Error(`--suite must be one of ${Object.keys(IPAD_RELEASE_SUITES).join(', ')}`);
  }
  if (!Number.isInteger(repeats) || repeats < MIN_RELEASE_RIG_REPEATS) {
    throw new Error(
      `--repeats must be an integer >= ${MIN_RELEASE_RIG_REPEATS}; single-repeat output is invalid`
    );
  }
  return { scenarios: IPAD_RELEASE_SUITES[suite] };
}

function validateRunIdentity(run, expected, label) {
  if (
    run.build?.appVersion !== expected.appVersion ||
    run.build?.buildTime !== expected.buildTime
  ) {
    throw new Error(`${label} came from a stale build`);
  }
  if (run.device?.id !== expected.device.id || run.device?.os !== expected.device.os) {
    throw new Error(`${label} came from a different device or OS`);
  }
}

export function normalizeReleaseRigReport({ metadata, engineRuns, frameRuns = [] }) {
  const { scenarios } = validateReleaseRigInputs(metadata);
  if (engineRuns.length !== metadata.repeats) {
    throw new Error(`Expected ${metadata.repeats} engine repeats, got ${engineRuns.length}`);
  }
  if (metadata.suite === 'full' && frameRuns.length !== metadata.repeats) {
    throw new Error(`Expected ${metadata.repeats} real-screen repeats, got ${frameRuns.length}`);
  }
  if (metadata.suite === 'fast' && frameRuns.length) {
    throw new Error('Fast suite must not publish real-screen runs');
  }

  engineRuns.forEach((run, index) => {
    validateRunIdentity(run, metadata, `Engine repeat ${index + 1}`);
    const keys = run.rows.map((row) => row.key);
    if (keys.length !== scenarios.length || scenarios.some((key) => !keys.includes(key))) {
      throw new Error(
        `Engine repeat ${index + 1} covered [${keys.join(', ')}], expected [${scenarios.join(', ')}]`
      );
    }
    for (const row of run.rows) {
      if (!finite(row.commits) || row.commits <= 0) {
        throw new Error(`Engine repeat ${index + 1} scenario ${row.key} has no commit samples`);
      }
    }
    if (run.console?.some((message) => message.level === 'error')) {
      throw new Error(`Engine repeat ${index + 1} contains a device console error`);
    }
  });

  frameRuns.forEach((run, index) => {
    validateRunIdentity(run, metadata, `Real-screen repeat ${index + 1}`);
    if (!run.mode?.startsWith('synthetic:')) {
      throw new Error(`Real-screen repeat ${index + 1} was not unattended synthetic drive`);
    }
    if (!run.summaries?.phases?.length) {
      throw new Error(`Real-screen repeat ${index + 1} has no measured phases`);
    }
    if (run.console?.some((message) => message.level === 'error')) {
      throw new Error(`Real-screen repeat ${index + 1} contains a device console error`);
    }
  });

  return {
    schemaVersion: 1,
    metadata: {
      ...metadata,
      scenarios,
      device: {
        label: PUBLIC_RIG_LABEL,
        model: metadata.device.model,
        os: metadata.device.os,
      },
    },
    engine: engineRuns.map(({ build, rows }) => ({ build, rows })),
    realScreen: frameRuns.map(({ build, mode, summaries }) => ({
      build,
      mode,
      summaries,
    })),
  };
}

function range(values, digits = 1) {
  const measured = values.filter(finite);
  if (!measured.length) return '—';
  const low = Math.min(...measured).toFixed(digits);
  const high = Math.max(...measured).toFixed(digits);
  return low === high ? low : `${low}–${high}`;
}

function engineTable(report) {
  return report.metadata.scenarios
    .map((key) => {
      const rows = report.engine.map((run) => run.rows.find((row) => row.key === key));
      return `<tr><th>${esc(key)}</th><td>${range(rows.map((row) => row['commit max ms']))}</td><td>${range(rows.map((row) => row['undo p95 ms']))}</td><td>${range(rows.map((row) => row['history MiB']))}</td><td>${rows.map((row) => row.commits).join(', ')}</td></tr>`;
    })
    .join('');
}

function realScreenTable(report) {
  if (!report.realScreen.length) return '';
  const phaseKeys = [
    ...new Set(report.realScreen.flatMap((run) => run.summaries.phases.map((phase) => phase.key))),
  ];
  const rows = phaseKeys
    .map((key) => {
      const phases = report.realScreen
        .map((run) => run.summaries.phases.find((phase) => phase.key === key))
        .filter(Boolean);
      return `<tr><th>${esc(key)}</th><td>${range(phases.map((phase) => phase.paintLatencyMs?.p95))}</td><td>${range(phases.map((phase) => phase.paintLatencyMs?.p99))}</td><td>${range(phases.map((phase) => phase.paintLatencyMs?.max))}</td><td>${range(
        phases.map((phase) =>
          phase.pacing ? phase.pacing.lostMs / (phase.contactSeconds * 10) : undefined
        ),
        2
      )}</td></tr>`;
    })
    .join('');
  return `<div class="section-head"><h2>Real-screen frames</h2><span class="desc">Unattended synthetic drive on the physical display</span></div><div class="table-wrap"><table><thead><tr><th>Phase</th><th>Paint P95 ms</th><th>Paint P99 ms</th><th>Paint max ms</th><th>Lost frames %</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const EXTRA_CSS = `
.intro,.method{max-width:82ch}.links{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.links a{padding:7px 12px;border:1px solid var(--hair);border-radius:9px;background:var(--card);font-size:.84rem;font-weight:700}.table-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:10px}table{width:100%;border-collapse:collapse;font-size:.78rem}th,td{text-align:right;padding:8px;border-top:1px solid var(--hair)}th:first-child{text-align:left}thead th{border-top:0;color:var(--muted)}.method{background:var(--card-2);border:1px solid var(--hair);border-radius:var(--r-md);padding:16px;color:var(--muted)}
`;

export function renderReleaseRigReport(report) {
  const { metadata } = report;
  const stats = `<span class="chip"><b>${metadata.suite}</b> suite</span><span class="chip"><b>${metadata.repeats}</b> repeats</span><span class="chip"><b>${metadata.scenarios.length}</b> scenarios</span>`;
  const header = masthead({
    title: 'Physical iPad release rig',
    tagline: 'Repeated engine gates and real-screen evidence from the tethered release device.',
    home: '../../../index.html',
    crumbs: [
      { label: 'Performance', href: '../../' },
      { label: 'iPad release rig', href: '../' },
      { label: metadata.capturedAt.slice(0, 10) },
    ],
    stats,
  });
  const frameLink = report.realScreen.length
    ? '<a href="real-screen.json">Normalized real-screen JSON</a>'
    : '';
  return page({
    title: `iPad release rig — ${metadata.capturedAt}`,
    extraCss: EXTRA_CSS,
    body: `${header}<main><div class="shell"><p class="intro">Splotch ${esc(metadata.appVersion)} at commit <code>${esc(metadata.commit)}</code> ran on ${esc(metadata.device.label)} (${esc(metadata.device.model)}, iPadOS ${esc(metadata.device.os)}). The build executed by the iPad reported the exact expected build time, and every configuration retained ${metadata.repeats} independent repeats.</p><div class="links"><a href="ipad-gates.json">Repeated ipad-gates.json</a>${frameLink}</div><div class="section-head"><h2>Engine gates</h2><span class="desc">Range across all repeats</span></div><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Commit max ms</th><th>Undo P95 ms</th><th>History MiB</th><th>Commit samples</th></tr></thead><tbody>${engineTable(report)}</tbody></table></div>${realScreenTable(report)}<div class="section-head"><h2>Method and provenance</h2></div><div class="method"><p>Suite: <b>${esc(metadata.suite)}</b>. Release tag: <code>${esc(metadata.releaseTag ?? 'none')}</code>. App build: <code>${esc(metadata.appVersion)}</code> at ${esc(metadata.buildTime)}. Device class: ${esc(metadata.device.model)}, iPadOS ${esc(metadata.device.os)}.</p><p>Every repeat is checked against the same exact physical device before its private identifier is removed from the public artifact. The fast suite covers ${metadata.scenarios.map(esc).join(', ')}. The full suite covers every engine scenario and repeats the production-route frame phase sweep with the probe's unattended synthetic driver. Physical hardware remains mandatory; no simulator result can populate this report.</p></div></div></main>${siteFooter({ home: '../../../index.html' })}`,
  });
}

export function writeReleaseRigReport(input, outputDir) {
  const report = normalizeReleaseRigReport(input);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'ipad-gates.json'),
    `${JSON.stringify(
      {
        schemaVersion: report.schemaVersion,
        metadata: report.metadata,
        runs: report.engine,
      },
      null,
      2
    )}\n`
  );
  if (report.realScreen.length) {
    writeFileSync(
      join(outputDir, 'real-screen.json'),
      `${JSON.stringify(
        {
          schemaVersion: report.schemaVersion,
          metadata: report.metadata,
          runs: report.realScreen,
        },
        null,
        2
      )}\n`
    );
  }
  writeFileSync(
    join(outputDir, 'index.html'),
    renderReleaseRigReport(report).replace(/[ \t]+$/gm, '')
  );
  return report;
}
