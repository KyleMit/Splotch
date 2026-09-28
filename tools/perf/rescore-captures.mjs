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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  ROOT,
  argFlag,
  argSwitch,
  fail,
  isMain,
  rejectUnknownFlags,
  runMain,
} from '../lib/proc.mjs';
import { describeFidelityFailures } from './lib/input-fidelity.mjs';
import { FLOOR_CONTROL_PAGE } from './split-capture/lib/probe-host-protocol.mjs';
import {
  evidenceIndexTargets,
  evidenceIndexUnattributable,
  findCaptureFiles,
  rescoreCapture,
  targetOf,
} from './lib/capture-rescore.mjs';

function round(value, places = 2) {
  const factor = 10 ** places;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : undefined;
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
    // A floor-control capture scores against the target's gate so it can be
    // compared with the app (ADR-0136), but it is never that target's result.
    // Its own column, so a re-admitted floor capture keeps both markings.
    ...(scored.floorControl ? { page: FLOOR_CONTROL_PAGE } : {}),
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
  corpus,
  filter,
  targetId,
  jsonOut,
  includeUnattributable = false,
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
          ...(entry.floorControl ? { page: FLOOR_CONTROL_PAGE } : {}),
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
  rejectUnknownFlags(['corpus', 'filter', 'target', 'json', 'include-unattributable']);
  runMain(async () => {
    await rescoreCaptures({
      corpus: argFlag('corpus'),
      filter: argFlag('filter'),
      targetId: argFlag('target'),
      jsonOut: argFlag('json'),
      includeUnattributable: argSwitch('include-unattributable'),
    });
  });
}
