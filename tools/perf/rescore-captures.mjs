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
import { basename, dirname, join, relative } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { summarizeRun } from './lib/real-screen-stats.mjs';
import {
  DEFAULT_CAPTURE_RUNTIME,
  describeFidelityFailures,
  inputFidelity,
} from './lib/input-fidelity.mjs';
import { refreshRegimeVerdict } from './lib/refresh-regime.mjs';
import { CAMPAIGN_TARGETS } from './lib/campaign-plan.mjs';
import {
  LOST_FRAME_TIME_SHARE_GATE,
  lostFrameTimeShareGateFor,
  scoreDrawingRun,
} from './lib/drawing-gates.mjs';

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

// A campaign tree lays cells out as <target>/<mode>/<brush>-real-screen.json, so
// the target is a leading path segment — but ONLY if it names a real target. The
// tracked evidence corpus nests campaign directories, and taking the first segment
// there reported the campaign NAME as the target: an iPad-web crayon capture at
// 1.1% lost was scored against the default 1% and rendered FAIL, when the gate it
// is actually held to is the 1.5% exception. A segment that is not a known target
// is not a target.
export function isKnownTarget(id) {
  return Boolean(id && Object.hasOwn(CAMPAIGN_TARGETS, id));
}

export function targetOf(parsed, relativePath, fallback) {
  const declared = parsed?.targetId ?? parsed?.target;
  if (isKnownTarget(declared)) return declared;
  for (const segment of relativePath.split('/').slice(0, -1)) {
    if (isKnownTarget(segment)) return segment;
  }
  return isKnownTarget(fallback) ? fallback : null;
}

// Every evidence index under the corpus, keyed by the capture's path relative to
// the corpus root. Reading only `<root>/index.json` found nothing for the nested
// shape the corpus actually has — one campaign directory per promotion, each with
// its own index — so the documented whole-corpus command fell through to the path
// segment and mis-targeted every capture.
// Every index entry under the corpus, keyed by the capture's path relative to
// the corpus ROOT — the nested-corpus join both consumers below depend on (one
// campaign directory per promotion, each with its own index; a naive per-index
// key mis-targeted every capture once already).
function evidenceIndexEntries(root) {
  const entries = [];
  for (const file of findCaptureFiles(root)) {
    if (basename(file) !== 'index.json') continue;
    let index;
    try {
      index = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const entry of index.kept ?? []) {
      if (!entry?.file) continue;
      entries.push({ key: relative(root, join(dirname(file), entry.file)), entry });
    }
  }
  return entries;
}

export function evidenceIndexTargets(root) {
  const targets = new Map();
  for (const { key, entry } of evidenceIndexEntries(root)) {
    if (isKnownTarget(entry.target)) targets.set(key, entry.target);
  }
  return targets;
}

// The captures a corpus index marks `cellAttributable: false` (issue 1315): the
// frame tables are genuine driven data, but the report's ?probe= nonce names a
// different cell than the file's label, so no number can be attributed to the
// brush/mode/theme it is filed under. Issue 1298's point: the marking existed
// where tools could read it and this tool did not read it — it walked the
// directory and scored contaminated evidence exactly like clean evidence.
// The value object carries the recorded nonce so both the refusal and a
// deliberate re-admittance can say what the capture actually saw.
export function evidenceIndexUnattributable(root) {
  const unattributable = new Map();
  for (const { key, entry } of evidenceIndexEntries(root)) {
    if (entry.cellAttributable !== false) continue;
    unattributable.set(key, { reportNonce: entry.reportNonce ?? null });
  }
  return unattributable;
}

export function rescoreCapture(parsed, { name, targetId }) {
  const report = rawReportOf(parsed);
  if (!report) return null;
  const brush = brushOf(parsed, name);
  const summaries = summarizeRun(report);
  const phase = summaries.phases?.[0];
  if (!phase) return null;
  // An unknown target must NOT quietly fall back to the plain gate: a cell that
  // carries an exception would then be scored against a threshold it was
  // explicitly excused from, and the table would say PASS or FAIL either way.
  const gateShare = targetId ? lostFrameTimeShareGateFor(targetId, brush) : null;
  const drawing = scoreDrawingRun(summaries.phases, gateShare ?? LOST_FRAME_TIME_SHARE_GATE);
  // A capture written before the artifact carried a runtime has to be told which
  // table judges it, and the target it was filed under is the only record of that
  // — the transport string alone does not separate an iPad WKWebView from an
  // Android one. An unknown target falls back to the runtime every threshold was
  // originally set from, so such a capture scores exactly as it did before.
  const runtime =
    parsed?.fidelity?.runtime ??
    (targetId ? CAMPAIGN_TARGETS[targetId]?.captureRuntime : null) ??
    DEFAULT_CAPTURE_RUNTIME;
  const fidelity = inputFidelity(phase.input ?? {}, runtime);
  const regime = refreshRegimeVerdict(
    summaries.intervalMs,
    targetId ? (CAMPAIGN_TARGETS[targetId]?.refreshRegime ?? null) : null,
    summaries.regimeMixture
  );
  return { name, target: targetId, brush, gateShare, summaries, drawing, fidelity, regime };
}

function row(scored) {
  const phase = scored.summaries.phases[0];
  const contact = phase.starvation?.inContact;
  const lost = contact?.lostFrameTimeShare ?? phase.pacing?.lostFrameTimeShare;
  return {
    capture: scored.name,
    // Present only on deliberately re-admitted rows, so a marked capture can
    // never sit in the table looking exactly like a clean one.
    ...(scored.cellAttributable === false ? { cell: 'UNATTRIBUTABLE' } : {}),
    target: scored.target ?? '(unknown)',
    brush: scored.brush,
    'mv/s': round(phase.input?.movesPerSecond, 1),
    beat: round(scored.summaries.intervalMs, 2),
    // Suffixed `?` when the capture is not scoreable on its beat — either it was
    // measured in another regime, or its target has no established regime to compare
    // against. Its lost-frame share can be 6x wrong while every other value in the
    // row looks ordinary.
    regime: scored.regime.scoreable ? scored.regime.observed : `${scored.regime.observed}?`,
    'paint p95': round(phase.paintLatencyMs?.p95, 1),
    'paint max': round(phase.paintLatencyMs?.max, 1),
    'lost %': round(lost * 100, 2),
    'gate %': scored.gateShare === null ? '?' : round(scored.gateShare * 100, 2),
    // A capture that fails fidelity must not be scored at all, however plausible
    // its number looks, so the verdict is printed beside the number and not
    // behind a flag. The FAILING CHECKS are named rather than a bare FAIL,
    // because which one failed decides whether the number means anything: the
    // pressure and contactGeometry thresholds have no calibrated expectation on
    // Android or desktop, so every capture from those runtimes is reported
    // `(uncalibrated)` on them and the matrix classes those targets advisory.
    // `cadence` is the one that invalidates a number outright, and a bare FAIL
    // hides which of the two you are looking at.
    fidelity: scored.fidelity.passed ? 'pass' : describeFidelityFailures(scored.fidelity),
    gate: scored.gateShare === null ? 'UNSCORED' : scored.drawing.passed ? 'PASS' : 'FAIL',
  };
}

export async function rescoreCaptures({
  corpus = argFlag('corpus'),
  filter = argFlag('filter'),
  targetId = argFlag('target'),
  jsonOut = argFlag('json'),
  includeUnattributable = process.argv.includes('--include-unattributable'),
} = {}) {
  if (!corpus) fail('--corpus=<dir> is required');
  const root = join(ROOT, corpus);
  const files = findCaptureFiles(root).filter((file) => !filter || file.includes(filter));
  if (!files.length) fail(`no capture JSON under ${corpus}${filter ? ` matching ${filter}` : ''}`);

  const indexTargets = evidenceIndexTargets(root);
  const unattributable = evidenceIndexUnattributable(root);
  const scored = [];
  const skipped = [];
  const refused = [];
  for (const file of files) {
    const name = relative(root, file).replace(/\.json$/, '');
    // Refused by default, not silently skipped: a contaminated capture
    // re-scores cleanly and answers wrongly, and the whole reason the index
    // carries the marking is so this tool cannot quote one by accident.
    // --include-unattributable re-admits them deliberately, for questions
    // about the instrument rather than the cell — and a re-admitted capture
    // stays VISIBLY marked in the table, the summary, and the JSON export,
    // because deliberateness recorded nowhere past the shell prompt is the
    // "kept, annotated in prose" weakness issue 1298 opened about.
    const marking = unattributable.get(relative(root, file));
    if (marking && !includeUnattributable) {
      refused.push({ name, reportNonce: marking.reportNonce });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      skipped.push({ name, reason: 'unparseable' });
      continue;
    }
    let result;
    try {
      result = rescoreCapture(parsed, {
        name,
        // The nearest evidence index wins: for a flat, mixed-target corpus it is
        // the only thing that knows which target a capture came from.
        targetId:
          indexTargets.get(relative(root, file)) ??
          targetOf(parsed, relative(root, file), targetId),
      });
    } catch (error) {
      skipped.push({ name, reason: error.message });
      continue;
    }
    if (result) {
      if (marking) {
        result.cellAttributable = false;
        result.reportNonce = marking.reportNonce;
      }
      scored.push(result);
    } else skipped.push({ name, reason: 'no raw frame table' });
  }

  console.table(scored.map(row));
  const unscoreable = scored.filter((entry) => !entry.fidelity.passed);
  const unknownTarget = scored.filter((entry) => entry.gateShare === null);
  const readmitted = scored.filter((entry) => entry.cellAttributable === false);
  console.log(
    `\n${scored.length} rescored · ${unscoreable.length} failed input fidelity · ` +
      `${unknownTarget.length} with no target identity · ${skipped.length} skipped · ` +
      (readmitted.length
        ? `${readmitted.length} re-admitted as cell-unattributable`
        : `${refused.length} refused as cell-unattributable`)
  );
  if (refused.length) {
    for (const entry of refused) {
      console.log(
        `  refused ${entry.name} — its index marks cellAttributable: false` +
          (entry.reportNonce ? ` (report nonce: ${entry.reportNonce})` : '')
      );
    }
    console.log(
      '  These frame tables belong to a different cell than their label (issue 1315). ' +
        'Pass --include-unattributable to re-score them deliberately, for questions ' +
        'about the instrument rather than the cell.'
    );
  }
  for (const entry of readmitted) {
    console.log(
      `  re-admitted ${entry.name} — cell-unattributable, its numbers answer for the ` +
        `instrument, not the labelled cell` +
        (entry.reportNonce ? ` (report nonce: ${entry.reportNonce})` : '')
    );
  }
  if (unknownTarget.length) {
    console.log(
      '  UNSCORED rows carry no target, so no gate applies — pass --target= for a ' +
        'single-target corpus, or rescore a tree that names its targets.'
    );
  }
  // Named rather than counted: a corpus is usually re-scored to answer a question
  // about a specific cell, and a silent omission is how that answer goes wrong.
  for (const entry of skipped) console.log(`  skipped ${entry.name} — ${entry.reason}`);
  // A corpus where nothing survived to score is not a success, for the same
  // reason an empty --filter match is not: an empty table must not read as a
  // clean answer. The refusals are already named above.
  if (!scored.length && refused.length) {
    console.error('every capture in this corpus was refused as cell-unattributable');
    process.exitCode = 1;
  }

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
          // The marking must outlive the terminal: an exported row from a
          // re-admitted capture carries its unattributability with it.
          ...(entry.cellAttributable === false
            ? { cellAttributable: false, reportNonce: entry.reportNonce ?? null }
            : {}),
        })),
        null,
        2
      )
    );
    console.log(`Wrote ${jsonOut}`);
  }
  return { scored, skipped, refused, readmitted };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await rescoreCaptures();
  });
}
