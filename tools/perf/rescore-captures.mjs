// Re-derive every capture in a corpus from its raw frame table, offline.
//
//   node tools/perf/rescore-captures.mjs --corpus=perf-profiles/campaign
//   node tools/perf/rescore-captures.mjs --corpus=<dir> --filter=crayon --target=ipad-device-web
//
// This is the tool that turns "the gate is wrong" from an assertion into a
// table. The 2026-08 campaign found three independent defects in its own metric,
// and each time the first question was what the correction does to every number
// already taken — ADR-0136 was validated across 43 captures this way before a
// line of product code changed.
//
// It re-derives from `report`, never from the `summaries` a capture carries:
// those were computed at capture time by whichever estimator the checked-out
// branch had, so comparing two captures through them compares two metrics. The
// scoring maths is imported from the shipped modules for the same reason — a
// local copy would answer what a private reimplementation says rather than what
// the gate says.
//
// Trialling a NEW charge is the same operation: change the shipped charge on a
// branch and run this over the corpus. That is how the credited charge was
// judged, and it exercises the real code path rather than a parallel one.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { summarizeRun } from './lib/real-screen-stats.mjs';
import { inputFidelity } from './ios/capture-xcuitest-screen.mjs';
import { lostFrameTimeShareGateFor, scoreDrawingRun } from './lib/drawing-gates.mjs';

const BRUSHES = ['crayon', 'magic', 'eraser', 'pen'];

export function findCaptureFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) found.push(full);
    }
  };
  walk(root);
  return found;
}

// Three envelopes reach this tool — the split transport's artifact, the Appium
// runner's, and a bare uploaded probe report — and all three carry the same raw
// table under `report`, or are that table.
export function rawReportOf(parsed) {
  if (parsed?.report?.frames) return parsed.report;
  if (parsed?.frames) return parsed;
  return null;
}

// The brush decides which gate a capture is held to, so guessing it wrong scores
// a cell against the wrong exception. The artifact's own field wins; the
// filename is the fallback for a corpus that predates it.
export function brushOf(parsed, filename) {
  if (parsed?.brush) return parsed.brush;
  const hit = BRUSHES.find((brush) => filename.includes(brush));
  return hit ?? 'pen';
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : undefined;
}

export function rescoreCapture(parsed, { name, targetId }) {
  const report = rawReportOf(parsed);
  if (!report) return null;
  const brush = brushOf(parsed, name);
  const summaries = summarizeRun(report);
  const phase = summaries.phases?.[0];
  if (!phase) return null;
  const gateShare = lostFrameTimeShareGateFor(targetId, brush);
  const drawing = scoreDrawingRun(summaries.phases, gateShare);
  const fidelity = inputFidelity(phase.input ?? {});
  return { name, brush, gateShare, summaries, drawing, fidelity };
}

function row(scored) {
  const phase = scored.summaries.phases[0];
  const contact = phase.starvation?.inContact;
  const lost = contact?.lostFrameTimeShare ?? phase.pacing?.lostFrameTimeShare;
  return {
    capture: scored.name,
    brush: scored.brush,
    'mv/s': round(phase.input?.movesPerSecond, 1),
    beat: round(scored.summaries.intervalMs, 2),
    'paint p95': round(phase.paintLatencyMs?.p95, 1),
    'paint max': round(phase.paintLatencyMs?.max, 1),
    'lost %': round(lost * 100, 2),
    'gate %': round(scored.gateShare * 100, 2),
    // A capture that fails fidelity must not be scored at all, however plausible
    // its number looks, so the verdict is printed beside the number and not
    // behind a flag.
    fidelity: scored.fidelity.passed ? 'pass' : 'FAIL',
    gate: scored.drawing.passed ? 'PASS' : 'FAIL',
  };
}

export async function rescoreCaptures({
  corpus = argFlag('corpus'),
  filter = argFlag('filter'),
  targetId = argFlag('target'),
  jsonOut = argFlag('json'),
} = {}) {
  if (!corpus) fail('--corpus=<dir> is required');
  const root = join(ROOT, corpus);
  const files = findCaptureFiles(root).filter((file) => !filter || file.includes(filter));
  if (!files.length) fail(`no capture JSON under ${corpus}${filter ? ` matching ${filter}` : ''}`);

  const scored = [];
  const skipped = [];
  for (const file of files) {
    const name = relative(root, file).replace(/\.json$/, '');
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      skipped.push({ name, reason: 'unparseable' });
      continue;
    }
    let result;
    try {
      result = rescoreCapture(parsed, { name, targetId });
    } catch (error) {
      skipped.push({ name, reason: error.message });
      continue;
    }
    if (result) scored.push(result);
    else skipped.push({ name, reason: 'no raw frame table' });
  }

  console.table(scored.map(row));
  const unscoreable = scored.filter((entry) => !entry.fidelity.passed);
  console.log(
    `\n${scored.length} rescored · ${unscoreable.length} failed input fidelity · ${skipped.length} skipped`
  );
  // Named rather than counted: a corpus is usually re-scored to answer a question
  // about a specific cell, and a silent omission is how that answer goes wrong.
  for (const entry of skipped) console.log(`  skipped ${entry.name} — ${entry.reason}`);

  if (jsonOut) {
    const out = join(ROOT, jsonOut);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        scored.map((entry) => ({
          name: entry.name,
          brush: entry.brush,
          gateShare: entry.gateShare,
          fidelity: entry.fidelity,
          drawing: entry.drawing,
          summaries: entry.summaries,
        })),
        null,
        2
      )
    );
    console.log(`Wrote ${jsonOut}`);
  }
  return { scored, skipped };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await rescoreCaptures();
  });
}
