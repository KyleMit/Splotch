// One capture re-derived from its raw frame table, plus the corpus reading that
// feeds it: which files are captures, and each capture's brush, target, and
// evidence-index attribution. The perf:rescore entry (rescore-captures.mjs)
// explains why it re-derives rather than trusting a capture's own summaries.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { drawingVerdicts } from './capture-verdicts.mjs';
import { CAMPAIGN_TARGETS } from './campaign-plan.mjs';
import { FLOOR_CONTROL_PAGE } from '../split-capture/lib/probe-host-protocol.mjs';
import {
  LOST_FRAME_TIME_SHARE_GATE,
  lostFrameTimeShareGateFor,
  scoreDrawingRun,
} from './drawing-gates.mjs';

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
// filename is the fallback for a corpus that predates it — and the final
// `?? 'pen'` is a GUESS, and it is silent. A capture whose artifact
// records no brush and whose path carries no brush token is filed as pen — which
// then scores it against pen's gate and, under the one-per-target-x-brush
// retention, lets it evict or be evicted by a real pen capture. Twenty-six
// crayon captures were dropped this way on 2026-08-27 with nothing in the output
// saying a guess had been made.
//
// It stays because old artifacts predate the recorded field and pen is the right
// guess for most of them. The protection is upstream: every capture writer must
// record the brush the engine COMMITTED, and name capture paths so the brush
// appears in them.
export function brushOf(parsed, filename) {
  if (parsed?.brush) return parsed.brush;
  const hit = BRUSHES.find((brush) => filename.includes(brush));
  return hit ?? 'pen';
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

// One evidence index's kept entries, as keep-capture-evidence wrote them. The
// rescorer and perf:analyze:frames both read an index through this, so a renamed
// field or a changed parse reaches every reader at once.
//
// An index that does not parse throws rather than being skipped: keep-capture-
// evidence writes these files, so an unreadable one is a broken corpus, and it
// is the only record of which captures are unattributable — skipping it would
// silently re-admit them and re-target the rest.
export function readEvidenceIndex(indexPath) {
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw new Error(`${relative(ROOT, indexPath)}: evidence index is not valid JSON`, {
      cause: error,
    });
  }
  return (index.kept ?? []).filter((entry) => entry?.file);
}

// Absence of the marking means attributable: keep-capture-evidence stamps only
// a capture whose nonce contradicts its label.
export function isUnattributable(entry) {
  return entry.cellAttributable === false;
}

// Every index entry under the corpus, keyed by the capture's path relative to
// the corpus ROOT. The corpus nests one campaign directory per promotion, each
// with its own index, so reading only `<root>/index.json` (or keying per index)
// fell through to the path segment and mis-targeted every capture.
export function evidenceIndexEntries(root) {
  const entries = [];
  for (const file of findCaptureFiles(root)) {
    if (basename(file) !== 'index.json') continue;
    for (const entry of readEvidenceIndex(file)) {
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
    if (!isUnattributable(entry)) continue;
    unattributable.set(key, { reportNonce: entry.reportNonce ?? null });
  }
  return unattributable;
}

export function rescoreCapture(parsed, { name, targetId }) {
  const report = rawReportOf(parsed);
  if (!report) return null;
  const brush = brushOf(parsed, name);
  // The target a capture was filed under declares the runtime that judges it —
  // the transport string alone does not separate an iPad WKWebView from an
  // Android one — and the regime its beat is held to. An unknown target declares
  // neither: the capture is judged by the runtime it recorded, and its beat
  // reads unestablished.
  const target = targetId ? CAMPAIGN_TARGETS[targetId] : null;
  const { summaries, fidelity, regime } = drawingVerdicts(parsed, {
    report,
    captureRuntime: target?.captureRuntime ?? null,
    refreshRegime: target?.refreshRegime ?? null,
  });
  if (!summaries.phases?.[0]) return null;
  // An unknown target must NOT quietly fall back to the plain gate: a cell that
  // carries an exception would then be scored against a threshold it was
  // explicitly excused from, and the table would say PASS or FAIL either way.
  const gateShare = targetId ? lostFrameTimeShareGateFor(targetId, brush) : null;
  const drawing = scoreDrawingRun(summaries.phases, gateShare ?? LOST_FRAME_TIME_SHARE_GATE);
  const floorControl = parsed?.page === FLOOR_CONTROL_PAGE;
  return {
    name,
    target: targetId,
    brush,
    gateShare,
    summaries,
    drawing,
    fidelity,
    regime,
    floorControl,
  };
}
