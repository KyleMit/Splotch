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
  LOST_FRAME_TIME_SHARE_EXCEPTIONS,
  LOST_FRAME_TIME_SHARE_GATE,
  lostFrameTimeShareGateFor,
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
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const THEMES = ['light', 'dark'];
const MODE_KEYS = ORIENTATIONS.flatMap((orientation) =>
  THEMES.map((theme) => `${orientation.toLowerCase()}-${theme}`)
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// A cell whose raw capture is gone still has published, normalized evidence in
// the last data.json. Copying that forward is how a rerun of the generator keeps
// a first valid result — including a red gate — instead of silently dropping the
// cell or recapturing it into a different number.
const PRESERVED = 'preserved';

function loadPreservedEvidence(manifest, manifestDirectory) {
  const spec = manifest.preservedEvidence;
  if (!spec) return null;
  if (typeof spec.from !== 'string' || !spec.from.trim()) {
    throw new Error('Performance matrix preservedEvidence.from must name a published report');
  }
  if (typeof spec.reason !== 'string' || !spec.reason.trim()) {
    throw new Error('Performance matrix preservedEvidence.reason must say why raw inputs are gone');
  }
  const published = readJson(sourcePath(spec.from, manifestDirectory));
  const byTarget = new Map(
    (published.targets ?? []).map((target) => [
      target.id,
      new Map((target.modes ?? []).map((mode) => [mode.id, mode])),
    ])
  );
  return { from: spec.from, reason: spec.reason, byTarget };
}

function preservedSection(preserved, targetId, mode, section) {
  if (!preserved) {
    throw new Error(
      `Target ${targetId} mode ${mode.id} marks ${section} preserved, but the manifest declares no preservedEvidence source`
    );
  }
  const publishedMode = preserved.byTarget.get(targetId)?.get(mode.id);
  if (!publishedMode) {
    throw new Error(
      `${preserved.from} has no ${targetId} mode ${mode.id} to preserve ${section} from`
    );
  }
  if (publishedMode[section] === undefined) {
    throw new Error(`${preserved.from} has no ${section} for ${targetId} mode ${mode.id}`);
  }
  return publishedMode[section];
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

function captureOrientation(profile) {
  const explicit = profile.orientation ?? profile.automation?.orientation;
  if (explicit) return String(explicit).toUpperCase();
  const viewport = profile.viewport ?? profile.report?.meta?.viewport;
  const width = viewport?.width ?? viewport?.w;
  const height = viewport?.height ?? viewport?.h;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) return null;
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

function captureTheme(profile) {
  const theme = profile.theme ?? profile.report?.meta?.theme;
  return theme ? String(theme).toLowerCase() : null;
}

function validateCaptureMode(profile, mode, source) {
  const orientation = captureOrientation(profile);
  const theme = captureTheme(profile);
  const modeLabel = `${mode.orientation.toLowerCase()} / ${mode.theme}`;
  if (!orientation) {
    throw new Error(`${source} is missing orientation metadata for ${modeLabel}`);
  }
  if (!theme) throw new Error(`${source} is missing theme metadata for ${modeLabel}`);
  if (orientation !== mode.orientation) {
    throw new Error(
      `${source} recorded ${orientation.toLowerCase()} orientation; expected ${mode.orientation.toLowerCase()}`
    );
  }
  if (theme !== mode.theme) {
    throw new Error(`${source} recorded ${theme} theme; expected ${mode.theme}`);
  }
}

function normalizeDrawingRun(source, productCommit, sourceDirectory, mode, gateShare) {
  const profile = readJson(sourcePath(source, sourceDirectory));
  validateCaptureMode(profile, mode, source);
  const phases = profile.report ? summarizeRun(profile.report).phases : profile.summaries?.phases;
  const scored = scoreDrawingRun(phases ?? [], gateShare);
  const failedFidelityChecks = Object.entries(profile.fidelity?.checks ?? {})
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  return {
    source,
    productCommit,
    fidelity: profile.fidelity ?? null,
    // A capture whose input fidelity failed is not a product pass or fail — the
    // capture runner's own contract calls it unscoreable, and rendering it as an
    // ordinary measurement launders a rejected input path into a product claim.
    scoreable: profile.fidelity?.passed !== false,
    failedFidelityChecks,
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
    scoreable: runs.length > 0 && runs.every((run) => run.scoreable !== false),
    failedFidelityChecks: [
      ...new Set(runs.flatMap((run) => run.failedFidelityChecks ?? [])),
    ].sort(),
  };
}

function normalizeDrawing(sources = {}, productCommit, sourceDirectory, mode, targetId) {
  return Object.fromEntries(
    BRUSHES.map((brush) => {
      const gateShare = lostFrameTimeShareGateFor(targetId, brush);
      const runs = (sources[brush] ?? []).map((source) =>
        normalizeDrawingRun(source, productCommit, sourceDirectory, mode, gateShare)
      );
      return [brush, { aggregate: aggregateDrawingRuns(runs), gateShare, runs }];
    })
  );
}

function normalizeUndo(source, productCommit, sourceDirectory, mode) {
  if (!source) return null;
  const profile = readJson(sourcePath(source, sourceDirectory));
  validateCaptureMode(profile, mode, source);
  const summary = profile.undo;
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

function normalizeActionCapture(spec, sourceDirectory, mode) {
  const profile = readJson(sourcePath(spec.source, sourceDirectory));
  validateCaptureMode(profile, mode, spec.source);
  const labels = spec.labels ? new Set(spec.labels) : null;
  // A capture is re-scored under its own recorded gate exceptions (ADR-0090
  // amendment); one without the field — every capture predating it, and every
  // non-iOS target — stays on the base gates.
  const summaries = profile.samples
    ? summarizeActions(profile.samples, [], profile.gateAllowances ?? {})
    : profile.summaries;
  const results = summaries
    .filter((summary) => summary.count > 0 && (!labels || labels.has(summary.label)))
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

function normalizeActions(sources, finalProductCommit, sourceDirectory, mode) {
  if (!sources?.length) return null;
  const captures = sources.map((source) => normalizeActionCapture(source, sourceDirectory, mode));
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

function normalizeMode(mode, target, finalProductCommit, sourceDirectory, preserved) {
  const normalizedMode = {
    ...mode,
    id: mode.id ?? modeKey(mode),
    orientation: String(mode.orientation).toUpperCase(),
    theme: String(mode.theme).toLowerCase(),
  };
  const shared = {
    id: normalizedMode.id,
    orientation: normalizedMode.orientation,
    theme: normalizedMode.theme,
    status: normalizedMode.status,
    fidelity: normalizedMode.fidelity ?? target.fidelity,
  };
  if (normalizedMode.status !== 'captured') {
    return { ...shared, reason: normalizedMode.reason };
  }
  const preservedSections = [];
  const resolveSection = (declared, section, compute) => {
    if (declared !== PRESERVED) return compute();
    preservedSections.push(section);
    return preservedSection(preserved, target.id, normalizedMode, section);
  };
  return {
    ...shared,
    drawingProductCommit: normalizedMode.drawingProductCommit,
    undoProductCommit: normalizedMode.undoProductCommit ?? normalizedMode.drawingProductCommit,
    drawing: resolveSection(normalizedMode.drawing, 'drawing', () =>
      normalizeDrawing(
        normalizedMode.drawing,
        normalizedMode.drawingProductCommit,
        sourceDirectory,
        normalizedMode,
        target.id
      )
    ),
    undo: resolveSection(normalizedMode.undoSource, 'undo', () =>
      normalizeUndo(
        normalizedMode.undoSource,
        normalizedMode.undoProductCommit ?? normalizedMode.drawingProductCommit,
        sourceDirectory,
        normalizedMode
      )
    ),
    actions: resolveSection(normalizedMode.actionSources, 'actions', () =>
      normalizeActions(
        normalizedMode.actionSources,
        finalProductCommit,
        sourceDirectory,
        normalizedMode
      )
    ),
    ...(preservedSections.length ? { preservedSections } : {}),
  };
}

function modeKey(mode) {
  return `${String(mode.orientation).toLowerCase()}-${String(mode.theme).toLowerCase()}`;
}

function normalizeCandidateActions(candidateActions) {
  if (candidateActions === undefined) return [];
  if (!Array.isArray(candidateActions)) {
    throw new Error('Performance matrix manifest candidateActions must be an array');
  }
  return candidateActions.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Performance matrix candidateActions[${index}] must be an object`);
    }
    for (const field of ['priority', 'action', 'rationale']) {
      if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
        throw new Error(`Performance matrix candidateActions[${index}].${field} must be text`);
      }
    }
    for (const field of ['applicability', 'status']) {
      if (
        candidate[field] !== undefined &&
        (typeof candidate[field] !== 'string' || !candidate[field].trim())
      ) {
        throw new Error(`Performance matrix candidateActions[${index}].${field} must be text`);
      }
    }
    return {
      priority: candidate.priority,
      action: candidate.action,
      rationale: candidate.rationale,
      ...(candidate.applicability === undefined ? {} : { applicability: candidate.applicability }),
      ...(candidate.status === undefined ? {} : { status: candidate.status }),
    };
  });
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 3) {
    const found = manifest.schemaVersion ?? 'missing';
    const migration =
      found === 2 ? ' Move each target’s capture fields into four targets[].modes entries.' : '';
    throw new Error(
      `Performance matrix manifest schemaVersion ${found} is unsupported; expected 3.${migration}`
    );
  }
  if (!Array.isArray(manifest.targets)) {
    throw new Error('Performance matrix manifest targets must be an array');
  }
  const targetIds = new Set();
  for (const target of manifest.targets) {
    if (targetIds.has(target.id)) throw new Error(`Duplicate performance target id: ${target.id}`);
    targetIds.add(target.id);
    if (!Array.isArray(target.modes)) {
      throw new Error(`Target ${target.id} must contain four explicit modes`);
    }
    const keys = target.modes.map(modeKey);
    const unknown = keys.filter((key) => !MODE_KEYS.includes(key));
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    const missing = MODE_KEYS.filter((key) => !keys.includes(key));
    if (unknown.length || duplicate || missing.length || keys.length !== MODE_KEYS.length) {
      const details = [
        unknown.length ? `unknown: ${unknown.join(', ')}` : null,
        duplicate ? `duplicate: ${duplicate}` : null,
        missing.length ? `missing: ${missing.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(
        `Target ${target.id} must contain exactly four explicit modes${details ? ` (${details})` : ''}`
      );
    }
    for (const mode of target.modes) {
      const id = mode.id ?? modeKey(mode);
      if (mode.id && mode.id !== modeKey(mode)) {
        throw new Error(`Target ${target.id} mode ${mode.id} does not match ${modeKey(mode)}`);
      }
      if (!['captured', 'unavailable'].includes(mode.status)) {
        throw new Error(`Target ${target.id} mode ${id} has invalid status ${mode.status}`);
      }
      if (mode.status === 'unavailable' && !mode.reason) {
        throw new Error(`Target ${target.id} mode ${id} must record an unavailable reason`);
      }
    }
  }
}

function normalizeTarget(target, finalProductCommit, sourceDirectory, preserved) {
  return {
    id: target.id,
    number: target.number,
    label: target.label,
    platform: target.platform,
    deviceKind: target.deviceKind,
    runtime: target.runtime,
    environment: target.environment,
    fidelity: target.fidelity,
    modes: target.modes.map((mode) =>
      normalizeMode(mode, target, finalProductCommit, sourceDirectory, preserved)
    ),
  };
}

function normalizeMatrix(manifest, sourceDirectory = ROOT) {
  validateManifest(manifest);
  const resolvedSourceDirectory = resolve(sourceDirectory, manifest.sourceRoot ?? '.');
  const preserved = loadPreservedEvidence(manifest, sourceDirectory);
  return {
    schemaVersion: 3,
    recordedOn: manifest.recordedOn,
    productCommit: manifest.productCommit,
    snapshotKind: manifest.snapshotKind,
    architecture: manifest.architecture,
    limitations: manifest.limitations ?? [],
    preservedEvidence: preserved ? { from: preserved.from, reason: preserved.reason } : null,
    candidateActions: normalizeCandidateActions(manifest.candidateActions),
    gates: {
      drawing: {
        paintP95Ms: PAINT_P95_GATE_MS,
        paintP99Ms: PAINT_P99_GATE_MS,
        paintMaxMs: PAINT_MAX_GATE_MS,
        lostFrameTimeShare: LOST_FRAME_TIME_SHARE_GATE,
        lostFrameTimeShareExceptions: LOST_FRAME_TIME_SHARE_EXCEPTIONS,
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
      normalizeTarget(target, manifest.productCommit, resolvedSourceDirectory, preserved)
    ),
  };
}

// Preservation is a provenance claim about the evidence, so the report states it
// rather than leaving a copied-forward cell looking freshly captured.
function preservedEvidenceNotes(matrix) {
  if (!matrix.preservedEvidence) return [];
  const cells = matrix.targets.flatMap((target) =>
    target.modes
      .filter((mode) => mode.preservedSections?.length)
      .map((mode) => `${target.label} · ${mode.id} (${mode.preservedSections.join(', ')})`)
  );
  if (!cells.length) return [];
  return [
    `${cells.length} cell${cells.length === 1 ? '' : 's'} carry results preserved from ${matrix.preservedEvidence.from} rather than re-read raw captures: ${matrix.preservedEvidence.reason} Preserved cells: ${cells.join('; ')}.`,
  ];
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) : '—';
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${fmt(value * 100)}%` : '—';
}

function displayMode(mode) {
  const orientation = `${mode.orientation[0]}${mode.orientation.slice(1).toLowerCase()}`;
  const theme = `${mode.theme[0].toUpperCase()}${mode.theme.slice(1)}`;
  return `${orientation} · ${theme}`;
}

function modeRows(matrix) {
  return matrix.targets.flatMap((target) =>
    target.modes.map((mode, modeIndex) => ({
      ...mode,
      targetId: target.id,
      targetNumber: target.number,
      targetLabel: target.label,
      platform: target.platform,
      deviceKind: target.deviceKind,
      runtime: target.runtime,
      environment: target.environment,
      modeLabel: displayMode(mode),
      firstTargetMode: modeIndex === 0,
    }))
  );
}

function rowLabel(row) {
  return `${row.targetLabel} · ${row.modeLabel}`;
}

function statusChip(entry) {
  if (entry.status !== 'captured') return '<span class="matrix-chip missing">Unavailable</span>';
  const label = entry.fidelity === 'release-gate' ? 'Release gate' : 'Advisory';
  return `<span class="matrix-chip ${entry.fidelity === 'release-gate' ? 'trusted' : ''}">${label}</span>`;
}

function drawingPlot(matrix, metric, gate, title) {
  const rows = modeRows(matrix)
    .map((target) => {
      if (target.status !== 'captured') {
        return `<div class="plot-row unavailable${target.firstTargetMode ? ' target-break' : ''}" title="${esc(target.reason)}">
        <div class="plot-label"><span>${esc(target.targetLabel)}</span><small>${esc(target.modeLabel)} · unavailable</small></div>
        <div class="plot-track"><i class="gate-line"></i></div>
      </div>`;
      }
      const dots = BRUSHES.map((brush, index) => {
        const result = target.drawing[brush].aggregate;
        const value = result.paint[metric];
        const ratio = Number.isFinite(value) ? Math.min(value / gate, 2) : null;
        const failed = Number.isFinite(value) && value > gate;
        const tooltip = `${rowLabel(target)} · ${BRUSH_LABELS[brush]} · ${metric.toUpperCase()} ${fmt(value)} ms · gate ${gate} ms`;
        const placement = ratio === null ? '' : `left:${ratio * 50}%;`;
        return `<span class="plot-dot brush-${brush}${failed ? ' failed' : ''}${ratio === null ? ' missing' : ''}" style="${placement}top:${8 + index * 7}px" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
      }).join('');
      return `<div class="plot-row${target.firstTargetMode ? ' target-break' : ''}">
        <div class="plot-label"><span>${esc(target.targetLabel)}</span><small>${esc(target.modeLabel)}</small></div>
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
      targets.flatMap((target) =>
        target.actions ? comparableActionResults(target.actions).map(({ label }) => label) : []
      )
    ),
  ];
}

function actionHeatmap(matrix) {
  const targets = modeRows(matrix);
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
        (target.actions ? comparableActionResults(target.actions) : []).map((result) => [
          result.label,
          result,
        ])
      );
      const cells = labels
        .map((label, index) => {
          const result = resultsByLabel.get(label);
          if (!result) {
            const availability =
              target.status === 'captured' ? 'not measured' : `unavailable: ${target.reason}`;
            const tooltip = `${index + 1}. ${label} · ${rowLabel(target)} · ${availability}`;
            return `<span class="heat-cell missing" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
          }
          const ratio = actionRatio(result, matrix.gates.actions);
          const provenance = result.productCommit ? ` · measured at ${result.productCommit}` : '';
          const tooltip = `${index + 1}. ${result.label} · ${rowLabel(target)} · first P95 ${fmt(result.firstFrame.p95)} ms · post P95 ${fmt(result.postActionFrames.p95)} ms · post max ${fmt(result.postActionFrames.max)} ms · ${result.passed ? 'PASS' : 'FAIL'}${provenance}`;
          return `<span class="heat-cell ${heatClass(ratio)}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
        })
        .join('');
      const comparableResults = target.actions ? comparableActionResults(target.actions) : [];
      const passingCount = comparableResults.filter((result) => result.passed).length;
      const score = target.actions ? `${passingCount}/${comparableResults.length}` : '—';
      return `<div class="heat-row${target.firstTargetMode ? ' target-break' : ''}"><div class="heat-label"><span>${esc(target.targetLabel)}<small>${esc(target.modeLabel)}</small></span><b>${score}</b></div><div class="heat-cells">${cells}</div></div>`;
    })
    .join('');
  const legend = labels
    .map((label, index) => `<li><b>${index + 1}</b><span>${esc(label)}</span></li>`)
    .join('');
  return `<div class="heat-scroll" style="--action-columns:${labels.length}">
    <div class="heat-row header"><div class="heat-label">Target <small>passing</small></div><div class="heat-cells">${columns}</div></div>
    ${rows}
  </div>
  <details class="action-key"><summary>Action-number key</summary><ol>${legend}</ol></details>`;
}

function rankedActionFailures(matrix) {
  const captured = modeRows(matrix).filter((target) => target.actions);
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
        `<li><span class="rank">${index + 1}</span><span><b>${esc(entry.label)}</b><small>${entry.failed} of ${entry.measured} modes failed · worst ${fmt(entry.worstRatio)}× gate</small></span></li>`
    )
    .join('');
}

function undoTable(matrix) {
  return modeRows(matrix)
    .map((target) => {
      if (target.status !== 'captured') {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">Unavailable: ${esc(target.reason)}</td></tr>`;
      }
      if (!target.undo) {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">No engine/next-frame probe</td></tr>`;
      }
      return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td>${fmt(target.undo.engine.p95)}</td><td>${fmt(target.undo.nextFrame.p95)}</td><td>${fmt(target.undo.nextFrame.max)}</td><td><span class="verdict ${target.undo.passed ? 'pass' : 'fail'}">${target.undo.passed ? 'Pass' : 'Fail'}</span></td></tr>`;
    })
    .join('');
}

function targetCards(matrix) {
  return matrix.targets
    .map((target) => {
      const modes = target.modes
        .map((mode) => {
          if (mode.status !== 'captured') {
            return `<li class="unavailable"><div><b>${esc(displayMode(mode))}</b>${statusChip(mode)}</div><small>${esc(mode.reason)}</small></li>`;
          }
          const actionResults = mode.actions ? comparableActionResults(mode.actions) : [];
          const passingCount = actionResults.filter((result) => result.passed).length;
          return `<li><div><b>${esc(displayMode(mode))}</b>${statusChip(mode)}</div><small>${mode.actions ? `${passingCount}/${actionResults.length} actions passing` : 'Actions not measured'}</small></li>`;
        })
        .join('');
      return `<article class="target-card">
        <div><span class="target-number">${target.number}</span></div>
        <h3>${esc(target.label)}</h3><p>${esc(target.environment)}</p><ul class="target-modes">${modes}</ul>
      </article>`;
    })
    .join('');
}

function provenanceTable(matrix) {
  return modeRows(matrix)
    .map((target) => {
      if (target.status !== 'captured') {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">Unavailable: ${esc(target.reason)}</td></tr>`;
      }
      const actionCommits = target.actions
        ? [...new Set(target.actions.sources.map((source) => source.productCommit))].join(', ')
        : '—';
      const actionCoverage = target.actions
        ? `${target.actions.finalProductCommitActionCount}/${comparableActionResults(target.actions).length}`
        : '—';
      return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td><code>${esc(target.drawingProductCommit)}</code></td><td><code>${esc(target.undoProductCommit)}</code></td><td>${actionCoverage}</td><td><code>${esc(actionCommits)}</code></td></tr>`;
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

function drawingAggregateAvailable(aggregate) {
  return (
    aggregate.runCount > 0 ||
    ['p95', 'p99', 'max'].some((metric) => Number.isFinite(aggregate.paint[metric]))
  );
}

function renderCandidateActionsMarkdown(candidateActions) {
  if (!candidateActions.length) return '';
  const rows = candidateActions.map((candidate) => [
    candidate.priority,
    candidate.action,
    candidate.rationale,
    candidate.applicability ?? '—',
    candidate.status ?? '—',
  ]);
  return `
## Candidate actions

${markdownTable(['Priority', 'Action', 'Rationale', 'Applicability', 'Status'], rows)}
`;
}

// Every cell held to something other than the single lost-frame gate, so a
// reader never has to infer an exemption from a passing number.
function renderLostFrameExceptionsMarkdown(exceptions) {
  const entries = Object.entries(exceptions);
  if (entries.length === 0) return '';
  const lines = entries.map(([cell, { share, reason }]) => {
    const [targetId, brush] = cell.split(':');
    return `- **${BRUSH_LABELS[brush] ?? brush} on \`${targetId}\`** — ${fmtPercent(share)}. ${reason}`;
  });
  return `Cells held to a different lost-frame budget, and why (ADR-0137):\n\n${lines.join('\n')}\n`;
}

function renderMarkdown(matrix) {
  const rows = modeRows(matrix);
  const drawingRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, ...BRUSHES.map(() => `Unavailable: ${target.reason}`)];
    }
    return [
      label,
      ...BRUSHES.map((brush) => {
        const aggregate = target.drawing[brush].aggregate;
        if (!drawingAggregateAvailable(aggregate)) return 'Unavailable: not measured';
        const value = `${fmt(aggregate.paint.p95)} / ${fmt(aggregate.paint.p99)} / ${fmt(aggregate.paint.max)} · L${fmtPercent(aggregate.lostFrameTimeShare)}`;
        // Unscoreable is neither Pass nor FAIL. Every sample behind this cell
        // failed its input-fidelity gate, so the number describes an input path
        // the runner rejects; the failed check is named so the reader can see
        // which one rather than inferring it from a target-level advisory label.
        if (aggregate.scoreable === false) {
          return `_unscoreable (${aggregate.failedFidelityChecks.join(', ')})_: ${value}`;
        }
        return aggregate.blankPassed ? value : `**FAIL ${value}**`;
      }),
    ];
  });
  const undoRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, '—', `Unavailable: ${target.reason}`, '—'];
    }
    return [
      label,
      target.undo
        ? `${fmt(target.undo.engine.p95)} / ${fmt(target.undo.nextFrame.p95)} / ${fmt(target.undo.nextFrame.max)}`
        : '—',
      target.undo ? markdownStatus(target.undo.passed) : 'Not measured',
      target.undo ? target.undo.productCommit : '—',
    ];
  });
  const actionRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, '—', '—', '—', '—', `Unavailable: ${target.reason}`];
    }
    if (!target.actions) {
      return [label, '—', '—', '—', '—', 'Not measured'];
    }
    const comparable = comparableActionResults(target.actions);
    const failures = comparable.filter((result) => !result.passed).map((result) => result.label);
    return [
      label,
      `${comparable.filter((result) => result.passed).length} / ${comparable.length}`,
      `${target.actions.finalProductCommitActionCount} / ${comparable.length}`,
      fmt(target.actions.worst.firstFrameP95),
      `${fmt(target.actions.worst.postActionFrameP95)} / ${fmt(target.actions.worst.postActionFrameMax)}`,
      failures.length ? failures.join('; ') : 'None',
    ];
  });
  const provenanceRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, `Unavailable: ${target.reason}`, '—', '—'];
    }
    return [
      label,
      target.drawingProductCommit,
      target.undo ? target.undoProductCommit : '—',
      target.actions
        ? [...new Set(target.actions.sources.map((source) => source.productCommit))].join(', ')
        : '—',
    ];
  });
  const limitations = [...matrix.limitations, ...preservedEvidenceNotes(matrix)]
    .map((limitation) => `- ${limitation}`)
    .join('\n');
  return `# Deployment-target performance matrix — ${matrix.recordedOn}

This deployment-target snapshot combines the campaign evidence declared in \`sources.json\`.
\`${matrix.productCommit}\` is the measured product commit. Every normalized result retains its
target, mode, commit, and raw artifact; focused action captures, when present, replace only their
declared scenarios within that mode.

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

${renderLostFrameExceptionsMarkdown(matrix.gates.drawing.lostFrameTimeShareExceptions ?? {})}
## Capture limitations

${limitations || '- None recorded.'}
${renderCandidateActionsMarkdown(matrix.candidateActions ?? [])}

## Commit provenance

${markdownTable(['Target', 'Drawing', 'Undo', 'Action source commits'], provenanceRows)}

## Drawing

Each cell is blank-paper paint \`P95 / P99 / max\` in milliseconds, followed by the cumulative
lost-frame share of in-contact time. Every target retains separate portrait/landscape and
light/dark rows.

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

Action sources are applied in manifest order within one target mode. A focused capture replaces
only its declared labels in that mode; all other labels retain their earlier measurement and
provenance. Drawing raw tables and action samples are re-scored with the current metric definitions
when this report is generated; stored derived summaries are not trusted. Physical iPad web remains
the Safari-calibrated release gate. Simulator, desktop, native-shell, and automated Android input
are advisory comparisons.
`;
}

// Which target carries the calibrated release gate is a property of the evidence,
// not of the prose: the manifest marks it, and whether this campaign reached it —
// and what it found — follows from the normalized modes. Stating either in a fixed
// sentence lets the report contradict its own tables.
const GATE_FIDELITY = 'physical-safari-gated';

function gateAggregates(target) {
  return target.modes
    .filter((mode) => mode.status === 'captured')
    .flatMap((mode) => Object.values(mode.drawing ?? {}))
    .map((brush) => brush?.aggregate)
    .filter(Boolean);
}

function releaseGateSentence(matrix) {
  const gate = matrix.targets.find((target) => target.fidelity === GATE_FIDELITY);
  if (!gate) return 'No target in this campaign carries the calibrated Safari release gate.';

  const captured = gate.modes.filter((mode) => mode.status === 'captured').length;
  if (!captured) {
    return `${gate.label} is the calibrated release gate and is unavailable in this campaign.`;
  }

  const aggregates = gateAggregates(gate);
  const scoreable = aggregates.filter((aggregate) => aggregate.scoreable !== false);
  const unscoreable = aggregates.length - scoreable.length;
  const failing = scoreable.filter(
    (aggregate) => (aggregate.allPhasesPassed ?? aggregate.blankPassed) === false
  ).length;
  const coverage = `${captured}/${gate.modes.length} modes captured`;
  const verdict = !scoreable.length
    ? 'no drawing aggregate scored'
    : failing
      ? `${failing} of ${scoreable.length} brush aggregates over gate`
      : `all ${scoreable.length} brush aggregates inside gate`;
  const caveat = unscoreable ? `, ${unscoreable} unscoreable (failed input fidelity)` : '';
  return `${gate.label} is the calibrated release gate — ${coverage}, ${verdict}${caveat}.`;
}

const EXTRA_CSS = `
.matrix-intro{max-width:78ch;color:var(--muted);margin:0 0 22px}.matrix-links{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0}.matrix-link{display:inline-flex;padding:7px 12px;border:1px solid var(--hair);border-radius:9px;background:var(--card);font-size:.84rem;font-weight:700}.target-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.target-card{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px;box-shadow:var(--shadow-sm)}.target-card>div:first-child{display:flex;align-items:center;justify-content:space-between}.target-card h3{font-size:1rem;margin:10px 0 5px}.target-card p{font-size:.78rem;color:var(--muted);margin:0;min-height:2.6em}.target-number{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;background:var(--card-2);font-size:.76rem;font-weight:800}.target-modes{list-style:none;padding:0;margin:12px 0 0}.target-modes li{padding:8px 0;border-top:1px solid var(--hair)}.target-modes li>div{display:flex;justify-content:space-between;gap:8px;align-items:center}.target-modes b{font-size:.72rem}.target-modes small{display:block;margin-top:3px;color:var(--muted);font-size:.68rem}.target-modes .unavailable{opacity:.72}.matrix-chip{font-size:.67rem;font-weight:750;padding:3px 8px;border-radius:999px;background:var(--accent-wash);color:var(--accent-ink)}.matrix-chip.trusted{background:color-mix(in srgb,var(--ok) 15%,var(--card));color:var(--ok)}.matrix-chip.missing{background:var(--card-2);color:var(--muted)}.provenance{overflow-x:auto;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:10px}.provenance code{font-size:.68rem}.brush-legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 16px;font-size:.78rem;color:var(--muted)}.brush-legend span{display:inline-flex;align-items:center;gap:6px}.brush-legend i{width:9px;height:9px;border-radius:50%}.brush-pen{--dot:var(--accent)}.brush-crayon{--dot:var(--warn)}.brush-magic{--dot:color-mix(in srgb,var(--accent) 55%,var(--bad))}.brush-eraser{--dot:var(--ok)}.brush-legend .brush-pen,.brush-legend .brush-crayon,.brush-legend .brush-magic,.brush-legend .brush-eraser{background:var(--dot)}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:14px;overflow-x:auto;padding-bottom:6px}.metric-panel{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px;min-width:300px}.metric-title{display:flex;justify-content:space-between;align-items:baseline}.metric-title h3{font-size:.95rem;margin:0}.metric-title span{font-size:.7rem;color:var(--muted)}.plot-axis{margin:10px 0 2px;padding-left:125px;display:flex;justify-content:space-between;font-size:.62rem;color:var(--faint)}.plot-row{display:grid;grid-template-columns:116px 1fr;gap:9px;align-items:center;min-height:41px}.plot-row.target-break,.heat-row.target-break{margin-top:10px}.plot-row.unavailable{opacity:.65}.plot-label{min-width:0}.plot-label span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.72rem;font-weight:700}.plot-label small{font-size:.63rem;color:var(--faint)}.plot-track{height:36px;position:relative;border-left:1px solid var(--hair-strong);border-right:1px solid var(--hair);background:linear-gradient(90deg,transparent 49.7%,color-mix(in srgb,var(--warn) 13%,transparent) 50%,color-mix(in srgb,var(--warn) 13%,transparent) 100%)}.plot-track:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 24.8%,var(--hair) 25%,transparent 25.2%,transparent 74.8%,var(--hair) 75%,transparent 75.2%);pointer-events:none}.gate-line{position:absolute;left:50%;top:0;bottom:0;border-left:2px dashed var(--warn)}.plot-dot{position:absolute;width:8px;height:8px;border:2px solid var(--card);border-radius:50%;background:var(--dot);box-shadow:0 0 0 1px color-mix(in srgb,var(--dot) 50%,var(--hair));transform:translate(-50%,-50%);z-index:2}.plot-dot.failed{width:11px;height:11px;box-shadow:0 0 0 2px var(--bad)}.heat-scroll{overflow-x:auto;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:13px}.heat-row{display:grid;grid-template-columns:210px max-content;gap:10px;align-items:center;margin:4px 0}.heat-row.header{margin-bottom:8px}.heat-label{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:.72rem;font-weight:700;white-space:nowrap}.heat-label span small{display:block;color:var(--faint);font-weight:400}.heat-label b{font-size:.68rem;color:var(--muted)}.heat-cells{display:grid;grid-template-columns:repeat(var(--action-columns),15px);gap:3px}.heat-cell,.action-number{width:15px;height:15px;border-radius:3px;display:block}.heat-cell.missing{background:var(--card-2)}.action-number{font-size:.5rem;text-align:center;color:var(--faint);line-height:15px}.heat-cell.cool{background:color-mix(in srgb,var(--accent) 35%,var(--card-2))}.heat-cell.pass{background:color-mix(in srgb,var(--ok) 70%,var(--card))}.heat-cell.warn{background:color-mix(in srgb,var(--warn) 78%,var(--card))}.heat-cell.hot{background:var(--bad)}.heat-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.72rem;color:var(--muted);margin:0 0 10px}.heat-legend span{display:inline-flex;gap:5px;align-items:center}.heat-legend i{width:11px;height:11px;border-radius:3px}.action-key{margin-top:10px;font-size:.78rem;color:var(--muted)}.action-key summary{cursor:pointer;font-weight:700;color:var(--accent-ink)}.action-key ol{columns:3;column-gap:30px;padding-left:24px}.action-key li{break-inside:avoid;padding:2px 0}.ranked-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(320px,1.2fr);gap:16px;margin-top:16px}.rank-card,.undo-card{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:15px}.rank-card h3,.undo-card h3{font-size:.95rem;margin:0 0 10px}.rank-list{list-style:none;padding:0;margin:0}.rank-list li{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--hair)}.rank-list li:first-child{border-top:0}.rank{display:grid;place-items:center;min-width:23px;height:23px;border-radius:7px;background:var(--card-2);font-size:.68rem;font-weight:800}.rank-list b{display:block;font-size:.78rem}.rank-list small{display:block;color:var(--muted);font-size:.68rem}table{width:100%;border-collapse:collapse;font-size:.72rem}th,td{text-align:right;padding:6px;border-top:1px solid var(--hair)}th:first-child{text-align:left}thead th{border-top:0;color:var(--muted);font-weight:650}tr.target-break th,tr.target-break td{border-top-color:var(--hair-strong)}.muted{color:var(--faint);text-align:left}.verdict{font-weight:800}.verdict.pass{color:var(--ok)}.verdict.fail{color:var(--bad)}.method{background:var(--card-2);border:1px solid var(--hair);border-radius:var(--r-md);padding:16px;color:var(--muted);font-size:.84rem}.method p{margin:0 0 10px}.method p:last-child{margin:0}@media(max-width:800px){.ranked-grid{grid-template-columns:1fr}.action-key ol{columns:1}.heat-row{grid-template-columns:170px max-content}.heat-label span{max-width:140px;overflow:hidden;text-overflow:ellipsis}}
.candidate-actions th,.candidate-actions td{text-align:left;vertical-align:top}
`;

function renderCandidateActionsHtml(candidateActions) {
  if (!candidateActions.length) return '';
  const rows = candidateActions
    .map(
      (candidate) =>
        `<tr><td><b>${esc(candidate.priority)}</b></td><td><b>${esc(candidate.action)}</b></td><td>${esc(candidate.rationale)}</td><td>${esc(candidate.applicability ?? '—')}</td><td>${esc(candidate.status ?? '—')}</td></tr>`
    )
    .join('');
  return `
  <div class="section-head"><h2>Candidate actions</h2><span class="desc">Additional gestures and workflows considered for this campaign</span></div>
  <div class="provenance candidate-actions"><table><thead><tr><th>Priority</th><th>Action</th><th>Rationale</th><th>Applicability</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
`;
}

function renderReport(matrix) {
  const rows = modeRows(matrix);
  const capturedTargetCount = matrix.targets.filter((target) =>
    target.modes.some((mode) => mode.status === 'captured')
  ).length;
  const capturedModeCount = rows.filter((row) => row.status === 'captured').length;
  const actionCount = comparableActionLabels(rows).length;
  const finalActionCount = rows.reduce(
    (count, row) => count + (row.actions?.finalProductCommitActionCount ?? 0),
    0
  );
  const stats = `<span class="chip"><b>${capturedTargetCount}/${matrix.targets.length}</b> targets captured</span><span class="chip"><b>${capturedModeCount}/${rows.length}</b> modes captured</span><span class="chip"><b>${actionCount}</b> actions compared</span><span class="chip"><b>${finalActionCount}</b> action rows at measured commit</span>`;
  const header = masthead({
    title: 'Deployment-target performance matrix',
    tagline:
      'Campaign evidence across physical devices, simulators, browsers, and native shells, with commit provenance on every measurement.',
    home: '../../index.html',
    crumbs: [{ label: 'Performance', href: '../' }, { label: matrix.recordedOn }],
    stats,
  });
  const body = `${header}
<main><div class="shell">
  <p class="matrix-intro"><code>${esc(matrix.productCommit)}</code> is the measured product commit. Each target keeps separate portrait/landscape and light/dark measurements. Focused captures, when present, replace only matching actions inside one mode. ${esc(releaseGateSentence(matrix))}</p>
  <div class="matrix-links"><a class="matrix-link" href="data.json">Normalized results JSON</a><a class="matrix-link" href="index.md">Detailed narrative</a><a class="matrix-link" href="sources.json">Source manifest</a></div>

  <div class="section-head"><h2>Capture limitations</h2><span class="desc">Constraints retained with the evidence</span></div>
  <div class="method"><ul>${[...(matrix.limitations ?? []), ...preservedEvidenceNotes(matrix)].map((limitation) => `<li>${esc(limitation)}</li>`).join('')}</ul></div>
${renderCandidateActionsHtml(matrix.candidateActions ?? [])}

  <div class="section-head"><h2>Coverage</h2><span class="desc">${matrix.targets.length} deployment targets · four explicit modes each</span></div>
  <div class="target-grid">${targetCards(matrix)}</div>

  <div class="section-head"><h2>Commit provenance</h2><span class="desc">Drawing, undo, and action source commits remain explicit per mode</span></div>
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
    <section class="rank-card"><h3>Most cross-mode failures</h3><ol class="rank-list">${rankedActionFailures(matrix)}</ol></section>
    <section class="undo-card"><h3>Undo engine and next-frame timing</h3><table><thead><tr><th>Target</th><th>Engine P95</th><th>Next P95</th><th>Next max</th><th>Gate</th></tr></thead><tbody>${undoTable(matrix)}</tbody></table></section>
  </div>

  <div class="section-head"><h2>How to read this snapshot</h2></div>
  <div class="method"><p>Drawing dots show the median P95/P99 and worst maximum across repeated blank-paper runs in one target mode. Raw drawing tables and action samples are re-scored with the current metric definitions. The committed JSON preserves every renderer phase, target mode, source commit, and raw source path.</p><p>Action sources are applied in manifest order inside one mode. A focused capture replaces only its declared labels in that mode; all other labels retain their earlier measurement and provenance. Profiling controls such as the idle-frame sample remain in normalized data but are omitted from the user-action comparison.</p></div>
</div></main>
${siteFooter({ home: '../../index.html' })}`;
  return page({
    title: `Deployment performance — ${matrix.recordedOn}`,
    extraCss: EXTRA_CSS,
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
