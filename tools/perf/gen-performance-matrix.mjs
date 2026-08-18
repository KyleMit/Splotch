import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { esc } from '../lib/html.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { masthead, page, siteFooter } from '../scrapbook/lib/scrapbook-chrome.mjs';
import {
  ACTION_FIRST_FRAME_GATE_MS,
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_FRAME_P95_GATE_MS,
  summarizeActions,
} from './lib/action-stats.mjs';
import { summarizeRun } from './lib/real-screen-stats.mjs';
import {
  LOST_FRAME_TIME_SHARE_GATE,
  PAINT_MAX_GATE_MS,
  PAINT_P95_GATE_MS,
  PAINT_P99_GATE_MS,
  scoreDrawingRun,
} from './lib/drawing-gates.mjs';
import {
  UNDO_ENGINE_P95_GATE_MS,
  UNDO_NEXT_FRAME_MAX_GATE_MS,
  UNDO_NEXT_FRAME_P95_GATE_MS,
} from './lib/undo-action-stats.mjs';

const DEFAULT_MANIFEST = join(
  ROOT,
  'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json'
);
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const BRUSH_LABELS = { pen: 'Pen', crayon: 'Crayon', magic: 'Magic', eraser: 'Eraser' };
const ACTION_CONTROL_LABELS = new Set(['idle frame control']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sourcePath(source, sourceDirectory) {
  return isAbsolute(source) ? source : resolve(sourceDirectory, source);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function roundShare(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function normalizedDistribution(distribution) {
  if (!distribution) return null;
  return Object.fromEntries(
    ['p50', 'p95', 'p99', 'max'].map((metric) => [metric, round(distribution[metric])])
  );
}

function normalizeDrawingRun(source, productCommit, sourceDirectory) {
  const profile = readJson(sourcePath(source, sourceDirectory));
  const phases = profile.report ? summarizeRun(profile.report).phases : profile.summaries?.phases;
  const scored = scoreDrawingRun(phases ?? []);
  return {
    source,
    productCommit,
    fidelity: profile.fidelity ?? null,
    phases: scored.phases.map((phase) => ({
      phase: phase.phase,
      paint: normalizedDistribution(phase.paint),
      lostFrameTimeShare: roundShare(phase.lostFrameTimeShare),
      passed: phase.passed,
    })),
    passed: scored.passed,
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function maximum(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function aggregateDrawingRuns(runs) {
  const blankPhases = runs.flatMap((run) => run.phases.filter((phase) => phase.phase === 'blank'));
  return {
    runCount: runs.length,
    paint: {
      p95: round(median(blankPhases.map((phase) => phase.paint.p95))),
      p99: round(median(blankPhases.map((phase) => phase.paint.p99))),
      max: round(maximum(blankPhases.map((phase) => phase.paint?.max))),
    },
    lostFrameTimeShare: roundShare(maximum(blankPhases.map((phase) => phase.lostFrameTimeShare))),
    blankPassed: blankPhases.length > 0 && blankPhases.every((phase) => phase.passed),
    allPhasesPassed: runs.length > 0 && runs.every((run) => run.passed),
  };
}

function normalizeDrawing(sources = {}, productCommit, sourceDirectory) {
  return Object.fromEntries(
    BRUSHES.map((brush) => {
      const runs = (sources[brush] ?? []).map((source) =>
        normalizeDrawingRun(source, productCommit, sourceDirectory)
      );
      return [brush, { aggregate: aggregateDrawingRuns(runs), runs }];
    })
  );
}

function normalizeUndo(source, productCommit, sourceDirectory) {
  if (!source) return null;
  const summary = readJson(sourcePath(source, sourceDirectory)).undo;
  if (!summary) return null;
  return {
    source,
    productCommit,
    count: summary.count,
    engine: normalizedDistribution(summary.engine),
    nextFrame: normalizedDistribution(summary.nextFrame),
    passed: summary.passed,
  };
}

function normalizeActionCapture(spec, sourceDirectory) {
  const profile = readJson(sourcePath(spec.source, sourceDirectory));
  const labels = spec.labels ? new Set(spec.labels) : null;
  // A capture is re-scored under its own recorded gate exceptions (ADR-0090
  // amendment); one without the field — every capture predating it, and every
  // non-iOS target — stays on the base gates.
  const summaries = profile.samples
    ? summarizeActions(profile.samples, [], profile.gateAllowances ?? {})
    : profile.summaries;
  const results = summaries
    .filter((summary) => !labels || labels.has(summary.label))
    .map((summary) => ({
      label: summary.label,
      count: summary.count,
      firstFrame: normalizedDistribution(summary.firstFrame),
      ready: normalizedDistribution(summary.ready),
      postActionFrames: normalizedDistribution(summary.frames),
      passed: summary.passed,
      source: spec.source,
      productCommit: spec.productCommit,
    }));
  const missingLabels = spec.labels?.filter(
    (label) => !results.some((result) => result.label === label)
  );
  if (missingLabels?.length) {
    throw new Error(`${spec.source} does not contain: ${missingLabels.join(', ')}`);
  }
  return {
    source: spec.source,
    productCommit: spec.productCommit,
    kind: spec.kind,
    selectedLabels: spec.labels ?? null,
    repeatCount: profile.repeats,
    results,
  };
}

function mergeActionResults(captures) {
  const byLabel = new Map();
  for (const capture of captures) {
    for (const result of capture.results) byLabel.set(result.label, result);
  }
  return [...byLabel.values()];
}

function normalizeActions(sources, finalProductCommit, sourceDirectory) {
  if (!sources?.length) return null;
  const captures = sources.map((source) => normalizeActionCapture(source, sourceDirectory));
  const results = mergeActionResults(captures);
  const comparableResults = results.filter((result) => !ACTION_CONTROL_LABELS.has(result.label));
  return {
    sources: captures.map(({ results: _results, ...capture }) => capture),
    fullSweepProductCommit:
      captures.findLast((capture) => capture.kind === 'full')?.productCommit ?? null,
    finalProductCommitActionCount: comparableResults.filter(
      (result) => result.productCommit === finalProductCommit
    ).length,
    actionCount: results.length,
    passedActionCount: results.filter((result) => result.passed).length,
    worst: {
      firstFrameP95: round(maximum(comparableResults.map((result) => result.firstFrame?.p95))),
      postActionFrameP95: round(
        maximum(comparableResults.map((result) => result.postActionFrames?.p95))
      ),
      postActionFrameMax: round(
        maximum(comparableResults.map((result) => result.postActionFrames?.max))
      ),
    },
    results,
  };
}

function normalizeTarget(target, finalProductCommit, sourceDirectory) {
  const shared = {
    id: target.id,
    number: target.number,
    label: target.label,
    platform: target.platform,
    deviceKind: target.deviceKind,
    runtime: target.runtime,
    environment: target.environment,
    status: target.status,
    fidelity: target.fidelity,
  };
  if (target.status !== 'captured') return { ...shared, reason: target.reason };
  return {
    ...shared,
    drawingProductCommit: target.drawingProductCommit,
    undoProductCommit: target.undoProductCommit ?? target.drawingProductCommit,
    drawing: normalizeDrawing(target.drawing, target.drawingProductCommit, sourceDirectory),
    undo: normalizeUndo(
      target.undoSource,
      target.undoProductCommit ?? target.drawingProductCommit,
      sourceDirectory
    ),
    actions: normalizeActions(target.actionSources, finalProductCommit, sourceDirectory),
  };
}

function normalizeMatrix(manifest, sourceDirectory = ROOT) {
  const resolvedSourceDirectory = resolve(sourceDirectory, manifest.sourceRoot ?? '.');
  return {
    schemaVersion: 2,
    recordedOn: manifest.recordedOn,
    productCommit: manifest.productCommit,
    snapshotKind: manifest.snapshotKind,
    architecture: manifest.architecture,
    limitations: manifest.limitations ?? [],
    gates: {
      drawing: {
        paintP95Ms: PAINT_P95_GATE_MS,
        paintP99Ms: PAINT_P99_GATE_MS,
        paintMaxMs: PAINT_MAX_GATE_MS,
        lostFrameTimeShare: LOST_FRAME_TIME_SHARE_GATE,
      },
      undo: {
        engineP95Ms: UNDO_ENGINE_P95_GATE_MS,
        nextFrameP95Ms: UNDO_NEXT_FRAME_P95_GATE_MS,
        nextFrameMaxMs: UNDO_NEXT_FRAME_MAX_GATE_MS,
      },
      actions: {
        firstFrameP95Ms: ACTION_FIRST_FRAME_GATE_MS,
        postActionFrameP95Ms: ACTION_FRAME_P95_GATE_MS,
        postActionFrameMaxMs: ACTION_FRAME_MAX_GATE_MS,
      },
    },
    targets: manifest.targets.map((target) =>
      normalizeTarget(target, manifest.productCommit, resolvedSourceDirectory)
    ),
  };
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) : '—';
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${fmt(value * 100)}%` : '—';
}

function statusChip(target) {
  if (target.status !== 'captured') return '<span class="matrix-chip missing">Unavailable</span>';
  const label = target.fidelity === 'release-gate' ? 'Release gate' : 'Advisory';
  return `<span class="matrix-chip ${target.fidelity === 'release-gate' ? 'trusted' : ''}">${label}</span>`;
}

function drawingPlot(matrix, metric, gate, title) {
  const targets = matrix.targets.filter((target) => target.status === 'captured');
  const rows = targets
    .map((target) => {
      const dots = BRUSHES.map((brush, index) => {
        const result = target.drawing[brush].aggregate;
        const value = result.paint[metric];
        const ratio = Number.isFinite(value) ? Math.min(value / gate, 2) : null;
        const failed = Number.isFinite(value) && value > gate;
        const tooltip = `${target.label} · ${BRUSH_LABELS[brush]} · ${metric.toUpperCase()} ${fmt(value)} ms · gate ${gate} ms`;
        const placement = ratio === null ? '' : `left:${ratio * 50}%;`;
        return `<span class="plot-dot brush-${brush}${failed ? ' failed' : ''}${ratio === null ? ' missing' : ''}" style="${placement}top:${8 + index * 7}px" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
      }).join('');
      return `<div class="plot-row">
        <div class="plot-label"><span>${esc(target.label)}</span><small>${esc(target.runtime)}</small></div>
        <div class="plot-track"><i class="gate-line"></i>${dots}</div>
      </div>`;
    })
    .join('');
  return `<section class="metric-panel">
    <div class="metric-title"><h3>${esc(title)}</h3><span>gate ${gate} ms</span></div>
    <div class="plot-axis"><span>0</span><span>gate</span><span>2× gate</span></div>
    ${rows}
  </section>`;
}

function actionRatio(result, gates) {
  return maximum(
    [
      [result.firstFrame.p95, gates.firstFrameP95Ms],
      [result.postActionFrames.p95, gates.postActionFrameP95Ms],
      [result.postActionFrames.max, gates.postActionFrameMaxMs],
    ]
      .filter(([value]) => Number.isFinite(value))
      .map(([value, gate]) => value / gate)
  );
}

function heatClass(ratio) {
  if (!Number.isFinite(ratio)) return 'missing';
  if (ratio <= 0.75) return 'cool';
  if (ratio <= 1) return 'pass';
  if (ratio <= 1.5) return 'warn';
  return 'hot';
}

function comparableActionResults(actions) {
  return actions.results.filter((result) => !ACTION_CONTROL_LABELS.has(result.label));
}

function comparableActionLabels(targets) {
  return [
    ...new Set(
      targets.flatMap((target) => comparableActionResults(target.actions).map(({ label }) => label))
    ),
  ];
}

function actionHeatmap(matrix) {
  const targets = matrix.targets.filter((target) => target.actions);
  const labels = comparableActionLabels(targets);
  const columns = labels
    .map(
      (label, index) =>
        `<span class="action-number" title="${esc(label)}" aria-label="Action ${index + 1}: ${esc(label)}">${index + 1}</span>`
    )
    .join('');
  const rows = targets
    .map((target) => {
      const resultsByLabel = new Map(
        comparableActionResults(target.actions).map((result) => [result.label, result])
      );
      const cells = labels
        .map((label, index) => {
          const result = resultsByLabel.get(label);
          if (!result) {
            const tooltip = `${index + 1}. ${label} · not measured`;
            return `<span class="heat-cell missing" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
          }
          const ratio = actionRatio(result, matrix.gates.actions);
          const provenance = result.productCommit ? ` · measured at ${result.productCommit}` : '';
          const tooltip = `${index + 1}. ${result.label} · first P95 ${fmt(result.firstFrame.p95)} ms · post P95 ${fmt(result.postActionFrames.p95)} ms · post max ${fmt(result.postActionFrames.max)} ms · ${result.passed ? 'PASS' : 'FAIL'}${provenance}`;
          return `<span class="heat-cell ${heatClass(ratio)}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
        })
        .join('');
      const comparableResults = comparableActionResults(target.actions);
      const passingCount = comparableResults.filter((result) => result.passed).length;
      return `<div class="heat-row"><div class="heat-label"><span>${esc(target.label)}</span><b>${passingCount}/${comparableResults.length}</b></div><div class="heat-cells">${cells}</div></div>`;
    })
    .join('');
  const legend = labels
    .map((label, index) => `<li><b>${index + 1}</b><span>${esc(label)}</span></li>`)
    .join('');
  return `<div class="heat-scroll">
    <div class="heat-row header"><div class="heat-label">Target <small>passing</small></div><div class="heat-cells">${columns}</div></div>
    ${rows}
  </div>
  <details class="action-key"><summary>Action-number key</summary><ol>${legend}</ol></details>`;
}

function rankedActionFailures(matrix) {
  const captured = matrix.targets.filter((target) => target.actions);
  const labels = comparableActionLabels(captured);
  const ranked = labels
    .map((label) => {
      const entries = captured.flatMap((target) => {
        const result = comparableActionResults(target.actions).find(
          (candidate) => candidate.label === label
        );
        return result ? [{ target, result }] : [];
      });
      return {
        label,
        failed: entries.filter((entry) => !entry.result.passed).length,
        measured: entries.length,
        worstRatio: maximum(
          entries.map((entry) => actionRatio(entry.result, matrix.gates.actions))
        ),
      };
    })
    .filter((entry) => entry.failed)
    .sort((a, b) => b.failed - a.failed || b.worstRatio - a.worstRatio)
    .slice(0, 10);
  return ranked
    .map(
      (entry, index) =>
        `<li><span class="rank">${index + 1}</span><span><b>${esc(entry.label)}</b><small>${entry.failed} of ${entry.measured} targets failed · worst ${fmt(entry.worstRatio)}× gate</small></span></li>`
    )
    .join('');
}

function undoTable(matrix) {
  return matrix.targets
    .filter((target) => target.status === 'captured')
    .map((target) => {
      if (!target.undo) {
        return `<tr><th>${esc(target.label)}</th><td colspan="4" class="muted">No engine/next-frame probe</td></tr>`;
      }
      return `<tr><th>${esc(target.label)}</th><td>${fmt(target.undo.engine.p95)}</td><td>${fmt(target.undo.nextFrame.p95)}</td><td>${fmt(target.undo.nextFrame.max)}</td><td><span class="verdict ${target.undo.passed ? 'pass' : 'fail'}">${target.undo.passed ? 'Pass' : 'Fail'}</span></td></tr>`;
    })
    .join('');
}

function targetCards(matrix) {
  return matrix.targets
    .map((target) => {
      const body =
        target.status === 'captured'
          ? (() => {
              const actionResults = target.actions ? comparableActionResults(target.actions) : [];
              const passingCount = actionResults.filter((result) => result.passed).length;
              return `<div class="target-scores"><span><b>${target.actions ? passingCount : '—'}</b><small>actions passing</small></span><span><b>${target.actions ? actionResults.length : '—'}</b><small>measured</small></span><span><b>${target.actions?.finalProductCommitActionCount ?? '—'}</b><small>at final commit</small></span></div>`;
            })()
          : `<p class="target-reason">${esc(target.reason)}</p>`;
      return `<article class="target-card ${target.status}">
        <div><span class="target-number">${target.number}</span>${statusChip(target)}</div>
        <h3>${esc(target.label)}</h3><p>${esc(target.environment)}</p>${body}
      </article>`;
    })
    .join('');
}

function provenanceTable(matrix) {
  return matrix.targets
    .filter((target) => target.status === 'captured')
    .map((target) => {
      const actionCommits = target.actions
        ? [...new Set(target.actions.sources.map((source) => source.productCommit))].join(', ')
        : '—';
      const actionCoverage = target.actions
        ? `${target.actions.finalProductCommitActionCount}/${comparableActionResults(target.actions).length}`
        : '—';
      return `<tr><th>${esc(target.label)}</th><td><code>${esc(target.drawingProductCommit)}</code></td><td><code>${esc(target.undoProductCommit)}</code></td><td>${actionCoverage}</td><td><code>${esc(actionCommits)}</code></td></tr>`;
    })
    .join('');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function markdownTable(headers, rows) {
  const header = `| ${headers.map(markdownCell).join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  return [header, rule, ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)].join(
    '\n'
  );
}

function markdownStatus(passed) {
  return passed ? 'Pass' : '**FAIL**';
}

function renderMarkdown(matrix) {
  const captured = matrix.targets.filter((target) => target.status === 'captured');
  const drawingRows = captured.map((target) => [
    `${target.number}. ${target.label}`,
    ...BRUSHES.map((brush) => {
      const aggregate = target.drawing[brush].aggregate;
      const value = `${fmt(aggregate.paint.p95)} / ${fmt(aggregate.paint.p99)} / ${fmt(aggregate.paint.max)} · L${fmtPercent(aggregate.lostFrameTimeShare)}`;
      return aggregate.blankPassed ? value : `**FAIL ${value}**`;
    }),
  ]);
  const undoRows = captured.map((target) => [
    `${target.number}. ${target.label}`,
    target.undo
      ? `${fmt(target.undo.engine.p95)} / ${fmt(target.undo.nextFrame.p95)} / ${fmt(target.undo.nextFrame.max)}`
      : '—',
    target.undo ? markdownStatus(target.undo.passed) : 'Not measured',
    target.undo ? target.undo.productCommit : '—',
  ]);
  const actionRows = captured.map((target) => {
    if (!target.actions) {
      return [`${target.number}. ${target.label}`, '—', '—', '—', '—', 'Not measured'];
    }
    const comparable = comparableActionResults(target.actions);
    const failures = comparable.filter((result) => !result.passed).map((result) => result.label);
    return [
      `${target.number}. ${target.label}`,
      `${comparable.filter((result) => result.passed).length} / ${comparable.length}`,
      `${target.actions.finalProductCommitActionCount} / ${comparable.length}`,
      fmt(target.actions.worst.firstFrameP95),
      `${fmt(target.actions.worst.postActionFrameP95)} / ${fmt(target.actions.worst.postActionFrameMax)}`,
      failures.length ? failures.join('; ') : 'None',
    ];
  });
  const provenanceRows = captured.map((target) => [
    `${target.number}. ${target.label}`,
    target.drawingProductCommit,
    target.undo ? target.undoProductCommit : '—',
    target.actions
      ? [...new Set(target.actions.sources.map((source) => source.productCommit))].join(', ')
      : '—',
  ]);
  const limitations = matrix.limitations.map((limitation) => `- ${limitation}`).join('\n');
  return `# Deployment-target performance matrix — ${matrix.recordedOn}

This cumulative snapshot combines retained deployment-target evidence with focused final-state
recaptures. \`${matrix.productCommit}\` is the final performance-affecting product commit. Every
normalized result retains the commit and raw artifact that produced it; focused action captures
replace only their declared scenarios.

The [interactive matrix](./index.html) is the quickest comparison. [\`data.json\`](./data.json)
contains every normalized drawing run and grouped action result, and
[\`sources.json\`](./sources.json) records the ordered source campaign.

Regenerate the JSON, Markdown, and HTML after updating the source manifest with:

\`\`\`sh
npm run gen:performance-matrix -- \\
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
\`\`\`

## Acceptance gates

Drawing passes at paint P95 ≤ ${matrix.gates.drawing.paintP95Ms} ms, P99 ≤ ${matrix.gates.drawing.paintP99Ms} ms,
max ≤ ${matrix.gates.drawing.paintMaxMs} ms, and cumulative lost frame time ≤ ${fmtPercent(matrix.gates.drawing.lostFrameTimeShare)} of in-contact time. Undo
passes at engine P95 ≤ ${matrix.gates.undo.engineP95Ms} ms, next-frame P95 ≤ ${matrix.gates.undo.nextFrameP95Ms} ms, and next-frame max ≤
${matrix.gates.undo.nextFrameMaxMs} ms. A discrete action passes at first-frame P95 ≤
${matrix.gates.actions.firstFrameP95Ms} ms, post-action frame P95 ≤ ${matrix.gates.actions.postActionFrameP95Ms} ms, and post-action frame max ≤
${matrix.gates.actions.postActionFrameMaxMs} ms.

## Capture limitations

${limitations || '- None recorded.'}

## Commit provenance

${markdownTable(['Target', 'Drawing', 'Undo', 'Action source commits'], provenanceRows)}

## Drawing

Each cell is blank-paper paint \`P95 / P99 / max\` in milliseconds, followed by the cumulative
lost-frame share of in-contact time. macOS values aggregate three runs; other targets use one run.

${markdownTable(['Target', 'Pen', 'Crayon', 'Magic', 'Eraser'], drawingRows)}

## Undo

Undo timing is \`engine P95 / next-frame P95 / next-frame max\` in milliseconds.

${markdownTable(['Target', 'Timing', 'Result', 'Product commit'], undoRows)}

## Discrete actions

The idle-frame profiling control remains in normalized data but is excluded below. The post-action
column is \`P95 / max\` in milliseconds. Full per-action timing and provenance are available in
the interactive matrix and normalized JSON.

${markdownTable(['Target', 'Passing', 'At final commit', 'Worst first P95', 'Worst post P95 / max', 'Failed actions'], actionRows)}

## Method

Action sources are applied in manifest order. A focused capture replaces only its declared labels;
all other labels retain their earlier measurement and provenance. Drawing raw tables and action
samples are re-scored with the current metric definitions when this report is generated; stored
derived summaries are not trusted. Physical iPad web remains the Safari-calibrated release gate.
Simulator, desktop, native-shell, and automated Android input are advisory comparisons.
`;
}

const EXTRA_CSS = `
.matrix-intro{max-width:78ch;color:var(--muted);margin:0 0 22px}.matrix-links{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0}.matrix-link{display:inline-flex;padding:7px 12px;border:1px solid var(--hair);border-radius:9px;background:var(--card);font-size:.84rem;font-weight:700}.target-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:12px}.target-card{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px;box-shadow:var(--shadow-sm)}.target-card.unavailable{border-style:dashed;opacity:.72}.target-card>div:first-child{display:flex;align-items:center;justify-content:space-between}.target-card h3{font-size:1rem;margin:10px 0 5px}.target-card p{font-size:.78rem;color:var(--muted);margin:0;min-height:2.6em}.target-number{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;background:var(--card-2);font-size:.76rem;font-weight:800}.matrix-chip{font-size:.67rem;font-weight:750;padding:3px 8px;border-radius:999px;background:var(--accent-wash);color:var(--accent-ink)}.matrix-chip.trusted{background:color-mix(in srgb,var(--ok) 15%,var(--card));color:var(--ok)}.matrix-chip.missing{background:var(--card-2);color:var(--muted)}.target-scores{display:flex!important;justify-content:flex-start!important;gap:18px!important;margin-top:13px}.target-scores span{display:flex;flex-direction:column}.target-scores b{font-size:1.16rem}.target-scores small{font-size:.68rem;color:var(--faint)}.target-reason{margin-top:13px!important;min-height:auto!important}.provenance{overflow-x:auto;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:10px}.provenance code{font-size:.68rem}.brush-legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 16px;font-size:.78rem;color:var(--muted)}.brush-legend span{display:inline-flex;align-items:center;gap:6px}.brush-legend i{width:9px;height:9px;border-radius:50%}.brush-pen{--dot:var(--accent)}.brush-crayon{--dot:var(--warn)}.brush-magic{--dot:color-mix(in srgb,var(--accent) 55%,var(--bad))}.brush-eraser{--dot:var(--ok)}.brush-legend .brush-pen,.brush-legend .brush-crayon,.brush-legend .brush-magic,.brush-legend .brush-eraser{background:var(--dot)}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:14px;overflow-x:auto;padding-bottom:6px}.metric-panel{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px;min-width:300px}.metric-title{display:flex;justify-content:space-between;align-items:baseline}.metric-title h3{font-size:.95rem;margin:0}.metric-title span{font-size:.7rem;color:var(--muted)}.plot-axis{margin:10px 0 2px;padding-left:125px;display:flex;justify-content:space-between;font-size:.62rem;color:var(--faint)}.plot-row{display:grid;grid-template-columns:116px 1fr;gap:9px;align-items:center;min-height:41px}.plot-label{min-width:0}.plot-label span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.72rem;font-weight:700}.plot-label small{font-size:.63rem;color:var(--faint)}.plot-track{height:36px;position:relative;border-left:1px solid var(--hair-strong);border-right:1px solid var(--hair);background:linear-gradient(90deg,transparent 49.7%,color-mix(in srgb,var(--warn) 13%,transparent) 50%,color-mix(in srgb,var(--warn) 13%,transparent) 100%)}.plot-track:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 24.8%,var(--hair) 25%,transparent 25.2%,transparent 74.8%,var(--hair) 75%,transparent 75.2%);pointer-events:none}.gate-line{position:absolute;left:50%;top:0;bottom:0;border-left:2px dashed var(--warn)}.plot-dot{position:absolute;width:8px;height:8px;border:2px solid var(--card);border-radius:50%;background:var(--dot);box-shadow:0 0 0 1px color-mix(in srgb,var(--dot) 50%,var(--hair));transform:translate(-50%,-50%);z-index:2}.plot-dot.failed{width:11px;height:11px;box-shadow:0 0 0 2px var(--bad)}.heat-scroll{overflow-x:auto;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:13px}.heat-row{display:grid;grid-template-columns:190px max-content;gap:10px;align-items:center;margin:4px 0}.heat-row.header{margin-bottom:8px}.heat-label{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:.72rem;font-weight:700;white-space:nowrap}.heat-label b{font-size:.68rem;color:var(--muted)}.heat-label small{color:var(--faint)}.heat-cells{display:grid;grid-template-columns:repeat(46,15px);gap:3px}.heat-cell,.action-number{width:15px;height:15px;border-radius:3px;display:block}.action-number{font-size:.5rem;text-align:center;color:var(--faint);line-height:15px}.heat-cell.cool{background:color-mix(in srgb,var(--accent) 35%,var(--card-2))}.heat-cell.pass{background:color-mix(in srgb,var(--ok) 70%,var(--card))}.heat-cell.warn{background:color-mix(in srgb,var(--warn) 78%,var(--card))}.heat-cell.hot{background:var(--bad)}.heat-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.72rem;color:var(--muted);margin:0 0 10px}.heat-legend span{display:inline-flex;gap:5px;align-items:center}.heat-legend i{width:11px;height:11px;border-radius:3px}.action-key{margin-top:10px;font-size:.78rem;color:var(--muted)}.action-key summary{cursor:pointer;font-weight:700;color:var(--accent-ink)}.action-key ol{columns:3;column-gap:30px;padding-left:24px}.action-key li{break-inside:avoid;padding:2px 0}.ranked-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(320px,1.2fr);gap:16px;margin-top:16px}.rank-card,.undo-card{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px}.rank-card h3,.undo-card h3{font-size:.95rem;margin:0 0 10px}.rank-list{list-style:none;padding:0;margin:0}.rank-list li{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--hair)}.rank-list li:first-child{border-top:0}.rank{display:grid;place-items:center;min-width:23px;height:23px;border-radius:7px;background:var(--card-2);font-size:.68rem;font-weight:800}.rank-list b{display:block;font-size:.78rem}.rank-list small{display:block;color:var(--muted);font-size:.68rem}table{width:100%;border-collapse:collapse;font-size:.72rem}th,td{text-align:right;padding:6px;border-top:1px solid var(--hair)}th:first-child{text-align:left}thead th{border-top:0;color:var(--muted);font-weight:650}.muted{color:var(--faint);text-align:left}.verdict{font-weight:800}.verdict.pass{color:var(--ok)}.verdict.fail{color:var(--bad)}.method{background:var(--card-2);border:1px solid var(--hair);border-radius:var(--r-md);padding:16px;color:var(--muted);font-size:.84rem}.method p{margin:0 0 10px}.method p:last-child{margin:0}@media(max-width:800px){.ranked-grid{grid-template-columns:1fr}.action-key ol{columns:1}.heat-row{grid-template-columns:150px max-content}.heat-label span{max-width:120px;overflow:hidden;text-overflow:ellipsis}}
`;

function renderReport(matrix) {
  const capturedCount = matrix.targets.filter((target) => target.status === 'captured').length;
  const actionCount = comparableActionLabels(
    matrix.targets.filter((target) => target.actions)
  ).length;
  const finalActionCount = matrix.targets.reduce(
    (count, target) => count + (target.actions?.finalProductCommitActionCount ?? 0),
    0
  );
  const stats = `<span class="chip"><b>${capturedCount}/${matrix.targets.length}</b> targets captured</span><span class="chip"><b>${actionCount}</b> actions per target</span><span class="chip"><b>${finalActionCount}</b> action rows at final commit</span>`;
  const header = masthead({
    title: 'Deployment-target performance matrix',
    tagline:
      'Cumulative retained evidence across physical devices, simulators, browsers, and native shells, with commit provenance on every measurement.',
    home: '../../index.html',
    crumbs: [{ label: 'Performance', href: '../' }, { label: matrix.recordedOn }],
    stats,
  });
  const body = `${header}
<main><div class="shell">
  <p class="matrix-intro"><code>${esc(matrix.productCommit)}</code> is the final performance-affecting product commit. This is a cumulative campaign report: measurements retain the commit that produced them, and focused final-commit captures replace only the matching actions. Physical-iPad web is the calibrated release gate; its retained older capture is not relabeled as final-current evidence.</p>
  <div class="matrix-links"><a class="matrix-link" href="data.json">Normalized results JSON</a><a class="matrix-link" href="index.md">Detailed narrative</a><a class="matrix-link" href="sources.json">Source manifest</a></div>

  <div class="section-head"><h2>Capture limitations</h2><span class="desc">Constraints retained with the evidence</span></div>
  <div class="method"><ul>${(matrix.limitations ?? []).map((limitation) => `<li>${esc(limitation)}</li>`).join('')}</ul></div>

  <div class="section-head"><h2>Coverage</h2><span class="desc">Nine requested deployment targets</span></div>
  <div class="target-grid">${targetCards(matrix)}</div>

  <div class="section-head"><h2>Commit provenance</h2><span class="desc">Final-commit action coverage is explicit; older retained evidence remains visible</span></div>
  <div class="provenance"><table><thead><tr><th>Target</th><th>Drawing</th><th>Undo</th><th>Final actions</th><th>Action source commits</th></tr></thead><tbody>${provenanceTable(matrix)}</tbody></table></div>

  <div class="section-head"><h2>Drawing margin to gate</h2><span class="desc">Blank-paper aggregate · each panel is normalized to its own gate</span></div>
  <div class="brush-legend">${BRUSHES.map((brush) => `<span><i class="brush-${brush}"></i>${BRUSH_LABELS[brush]}</span>`).join('')}<span>Dashed line = gate · ring = failure</span></div>
  <div class="metric-grid">
    ${drawingPlot(matrix, 'p95', matrix.gates.drawing.paintP95Ms, 'Paint P95')}
    ${drawingPlot(matrix, 'p99', matrix.gates.drawing.paintP99Ms, 'Paint P99')}
    ${drawingPlot(matrix, 'max', matrix.gates.drawing.paintMaxMs, 'Paint maximum')}
  </div>

  <div class="section-head"><h2>${actionCount}-action failure fingerprint</h2><span class="desc">Color is the worst ratio across first P95, post P95, and post max</span></div>
  <div class="heat-legend"><span><i class="heat-cell cool"></i>≤ 0.75× gate</span><span><i class="heat-cell pass"></i>0.75–1×</span><span><i class="heat-cell warn"></i>1–1.5×</span><span><i class="heat-cell hot"></i>&gt; 1.5×</span></div>
  ${actionHeatmap(matrix)}

  <div class="ranked-grid">
    <section class="rank-card"><h3>Most cross-target failures</h3><ol class="rank-list">${rankedActionFailures(matrix)}</ol></section>
    <section class="undo-card"><h3>Undo engine and next-frame timing</h3><table><thead><tr><th>Target</th><th>Engine P95</th><th>Next P95</th><th>Next max</th><th>Gate</th></tr></thead><tbody>${undoTable(matrix)}</tbody></table></section>
  </div>

  <div class="section-head"><h2>How to read this snapshot</h2></div>
  <div class="method"><p>Drawing dots show the median P95/P99 and worst maximum across repeated blank-paper runs. Raw drawing tables and action samples are re-scored with the current metric definitions. The committed JSON preserves every renderer phase, the source commit for each run, and the source artifact and commit for each action result.</p><p>Action sources are applied in manifest order. A focused capture replaces only its declared labels; all other labels retain their earlier measurement and provenance. Profiling controls such as the idle-frame sample remain in normalized data but are omitted from the user-action comparison.</p></div>
</div></main>
${siteFooter({ home: '../../index.html' })}`;
  return page({
    title: `Deployment performance — ${matrix.recordedOn}`,
    extraCss: EXTRA_CSS.replace(
      /grid-template-columns:repeat\(\d+,15px\)/,
      'grid-auto-flow:column;grid-auto-columns:15px'
    ),
    body,
  });
}

export async function generateDeploymentMatrixReport(manifestArg = process.argv[2]) {
  const manifestPath = manifestArg
    ? isAbsolute(manifestArg)
      ? manifestArg
      : join(ROOT, manifestArg)
    : DEFAULT_MANIFEST;
  const outputDir = dirname(manifestPath);
  const matrix = normalizeMatrix(readJson(manifestPath), outputDir);
  writeFileSync(join(outputDir, 'data.json'), `${JSON.stringify(matrix, null, 2)}\n`);
  writeFileSync(join(outputDir, 'index.md'), renderMarkdown(matrix));
  writeFileSync(join(outputDir, 'index.html'), renderReport(matrix).replace(/[ \t]+$/gm, ''));
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'data.json'))}`);
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'index.md'))}`);
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'index.html'))}`);
}

if (isMain(import.meta.url)) runMain(generateDeploymentMatrixReport);

export { mergeActionResults, normalizeMatrix, renderMarkdown, renderReport };
