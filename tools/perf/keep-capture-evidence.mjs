// Promote a campaign's representative captures into the tracked evidence corpus.
//
//   npm run perf:evidence:keep -- --corpus=perf-profiles/campaign --campaign=2026-08-android
//
// ADR-0138: raw captures are otherwise gitignored, so a metric correction cannot
// be applied to any number already published — it can only be recaptured on
// hardware, which is what left ten of eleven matrix targets on a superseded
// estimator. A curated subset makes re-scoring history a script instead.
//
// Two rules, both from that ADR. Captures are kept WHOLE: every trimming that
// saves meaningful space also drops a gate or corrupts the fidelity verdict, and
// a preserved capture that cannot prove its own fidelity is worse than none
// because it will be believed. And the subset is one capture per target x brush
// rather than per matrix cell, because a metric's effect varies with the display
// and the workload, not with orientation and theme.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { brushOf, findCaptureFiles, rawReportOf, targetOf } from './rescore-captures.mjs';

export const EVIDENCE_ROOT = 'perf-profiles/evidence';

export function modeOf(parsed) {
  const orientation =
    parsed?.orientation ?? parsed?.automation?.orientation ?? viewportOrientation(parsed);
  if (orientation) return `${orientation}-${parsed?.theme ?? 'light'}`;
  if (parsed?.mode) return parsed.mode;
  return 'unknown';
}

// The desktop transport records no orientation — it IS the viewport shape, and the
// matrix derives it back the same way. Without this a desktop capture falls
// through to `mode`, which on that transport holds the drive plan
// ("synthetic:mixed:crayon") rather than the cell.
function viewportOrientation(parsed) {
  const { width, height } = parsed?.viewport ?? {};
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) return null;
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

// One per target x brush. Ties are broken by keeping the FIRST seen rather than
// the best: picking the best sample would preserve a corpus that flatters the
// metric it exists to let someone re-examine.
export function selectEvidence(candidates) {
  const kept = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.target}:${candidate.brush}`;
    if (!kept.has(key)) kept.set(key, candidate);
  }
  return [...kept.values()];
}

export async function keepCaptureEvidence({
  corpus = argFlag('corpus'),
  campaign = argFlag('campaign'),
  target = argFlag('target'),
  filter = argFlag('filter'),
} = {}) {
  if (!corpus) fail('--corpus=<dir> is required');
  if (!campaign) fail('--campaign=<name> is required — the evidence corpus is keyed by campaign');
  const root = join(ROOT, corpus);

  const candidates = [];
  for (const file of findCaptureFiles(root)) {
    // One campaign directory can hold several targets, including ones captured on
    // an earlier run against a different product. --filter keeps a promotion scoped
    // to the targets this campaign actually took.
    if (filter && !file.includes(filter)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!rawReportOf(parsed)) continue;
    const relativePath = relative(root, file);
    candidates.push({
      file,
      relativePath,
      // `null` means "no gate applies" to the rescorer; the index wants a label.
      target: targetOf(parsed, relativePath, target) ?? 'unknown',
      brush: brushOf(parsed, relativePath),
      mode: modeOf(parsed),
      fidelity: parsed.fidelity?.passed ?? null,
    });
  }
  if (!candidates.length) fail(`no capture with a raw frame table under ${corpus}`);

  const selected = selectEvidence(candidates);
  const destination = join(ROOT, EVIDENCE_ROOT, campaign);
  mkdirSync(destination, { recursive: true });

  // Minified, not copied: a capture is ~2.4 MB pretty-printed and ~620 KB dense,
  // and the tracked corpus is sized in ADR-0138 on the dense form. Nothing is
  // dropped — only the whitespace.
  for (const entry of selected) {
    writeFileSync(
      join(destination, `${entry.target}-${entry.brush}.json`),
      JSON.stringify(JSON.parse(readFileSync(entry.file, 'utf8')))
    );
  }
  // The index is what makes the corpus readable without opening a frame table:
  // which cell each sample came from, and whether it can be scored at all.
  writeFileSync(
    join(destination, 'index.json'),
    JSON.stringify(
      {
        campaign,
        capturedFrom: corpus,
        kept: selected.map((entry) => ({
          file: `${entry.target}-${entry.brush}.json`,
          target: entry.target,
          brush: entry.brush,
          mode: entry.mode,
          fidelityPassed: entry.fidelity,
          source: entry.relativePath,
        })),
      },
      null,
      2
    )
  );

  console.log(
    `Kept ${selected.length} of ${candidates.length} captures in ${EVIDENCE_ROOT}/${campaign}`
  );
  for (const entry of selected) {
    console.log(
      `  ${entry.target}/${entry.brush}  ${entry.mode}  fidelity=${entry.fidelity ?? 'unreported'}  <- ${basename(entry.relativePath)}`
    );
  }
  return { selected, candidates };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await keepCaptureEvidence();
  });
}
