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
// because it will be believed. And a CAMPAIGN subset is one capture per target x
// brush rather than per matrix cell, because a metric's effect varies with the
// display and the workload, not with orientation and theme. Hand captures are
// the exception: every one is kept, because a hand corpus exists to show spread
// and each capture cost a person's time (see selectEvidence).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// Returns true when promotion must stop. With --force the existing corpus is
// removed WHOLE rather than merged into, so a run selecting fewer targets cannot
// leave the previous run's captures behind an index that no longer names them.
export function destinationBlocked(destination, { force }) {
  if (!existsSync(destination)) return false;
  if (!force) return true;
  rmSync(destination, { recursive: true, force: true });
  return false;
}

export function selectEvidence(candidates) {
  const kept = new Map();
  for (const candidate of candidates) {
    // A hand capture is one a person paid for, and a hand corpus exists to show
    // spread (see 2026-08-23-hand): every one is kept, not one per target x brush.
    const key = candidate.handCapture
      ? candidate.relativePath
      : `${candidate.target}:${candidate.brush}`;
    if (!kept.has(key)) kept.set(key, candidate);
  }
  return [...kept.values()];
}

// A campaign capture is filed by the cell it measured; a hand capture has no
// cell, and two of them can share a runtime, brush, and even label across
// sessions — so the name carries the basename for a human and a digest of the
// whole corpus-relative path for uniqueness. A separator-join flattening was
// not injective: run--a/hand.json and run/a--hand.json both flattened to the
// same name, and the second write silently replaced the first — the exact
// loss this function exists to prevent.
export function evidenceFileName(entry) {
  if (!entry.handCapture) return `${entry.target}-${entry.brush}.json`;
  const digest = createHash('sha256').update(entry.relativePath).digest('hex').slice(0, 8);
  return `${basename(entry.relativePath, '.json')}--${digest}.json`;
}

export async function keepCaptureEvidence({
  corpus = argFlag('corpus'),
  campaign = argFlag('campaign'),
  target = argFlag('target'),
  filter = argFlag('filter'),
  force = argFlag('force') !== undefined || process.argv.includes('--force'),
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
      // A hand capture has no campaign target — its runtime is the label that
      // says what it calibrates, matching the 2026-08-23-hand corpus naming.
      target:
        targetOf(parsed, relativePath, target) ??
        (parsed.handCapture === true ? parsed.runtime : null) ??
        'unknown',
      handCapture: parsed.handCapture === true,
      brush: brushOf(parsed, relativePath),
      mode: modeOf(parsed),
      fidelity: parsed.fidelity?.passed ?? null,
      // A hand capture's index row carries what the finger measured, so the
      // corpus is readable without opening a minified frame table — the shape
      // the 2026-08-23-hand corpus established.
      ...(parsed.handCapture === true
        ? {
            runtime: parsed.runtime ?? null,
            reading: parsed.reading ?? null,
            device: parsed.device ?? null,
            pageDelivery: parsed.pageDelivery ?? null,
            drawSeconds: parsed.drawSeconds ?? null,
          }
        : {}),
    });
  }
  if (!candidates.length) fail(`no capture with a raw frame table under ${corpus}`);

  const selected = selectEvidence(candidates);
  const destination = join(ROOT, EVIDENCE_ROOT, campaign);

  // Reusing a campaign name does NOT replace the corpus — it overwrites only the
  // files this run happens to select. A second promotion with fewer targets left
  // the earlier captures sitting beside a rewritten index that no longer mentions
  // them, and `perf:rescore` walks the directory rather than treating the index as
  // an allowlist, so those stale captures scored as current evidence.
  //
  // The whole directory is therefore replaced, and only after the new selection is
  // known to be non-empty — so a failed promotion cannot leave nothing behind.
  if (destinationBlocked(destination, { force })) {
    fail(
      `${EVIDENCE_ROOT}/${campaign} already exists. Promoting into it would leave ` +
        'captures this run did not select beside an index that no longer names them, ' +
        'and perf:rescore scores every JSON it finds. Pass --force to replace the ' +
        'corpus, or use a new --campaign name.'
    );
  }
  mkdirSync(destination, { recursive: true });

  // Minified, not copied: a capture is ~2.4 MB pretty-printed and ~620 KB dense,
  // and the tracked corpus is sized in ADR-0138 on the dense form. Nothing is
  // dropped — only the whitespace.
  for (const entry of selected) {
    writeFileSync(
      join(destination, evidenceFileName(entry)),
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
          file: evidenceFileName(entry),
          target: entry.target,
          brush: entry.brush,
          mode: entry.mode,
          fidelityPassed: entry.fidelity,
          source: entry.relativePath,
          ...(entry.handCapture
            ? {
                handCapture: true,
                runtime: entry.runtime,
                reading: entry.reading,
                device: entry.device,
                pageDelivery: entry.pageDelivery,
                drawSeconds: entry.drawSeconds,
              }
            : {}),
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
