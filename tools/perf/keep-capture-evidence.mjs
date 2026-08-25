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

// Returns true when promotion must stop. With --force the existing corpus is
// removed WHOLE rather than merged into, so a run selecting fewer targets cannot
// leave the previous run's captures behind an index that no longer names them.
export function destinationBlocked(destination, { force }) {
  if (!existsSync(destination)) return false;
  if (!force) return true;
  rmSync(destination, { recursive: true, force: true });
  return false;
}

// The two checks whose failure invalidates a capture's NUMBERS, not merely its
// per-runtime calibration: an untrusted touch is synthetic input, and cadence
// is "the one that invalidates a number outright" (rescore-captures.mjs's row
// rule). The other checks — coalescing, pressure, contactGeometry — are
// per-runtime table entries whose expectations have churned (issue 1303) and
// which several runtimes can NEVER pass as things stand; keying selection on
// `fidelity.passed` would therefore refuse every native-target promotion
// permanently. Keyed on the checks themselves rather than the artifact's
// `uncalibrated` list because the banked corpus predates that field.
const NUMBER_INVALIDATING_CHECKS = ['trustedTouch', 'cadence'];

// Scoreability tiers, best first. Preference is by scoreability, never by
// score — within a tier the FIRST seen wins, because picking the best NUMBER
// would preserve a corpus that flatters the metric it exists to let someone
// re-examine. A verdict failing only calibration checks outranks no verdict
// at all (ADR-0138: a capture that cannot prove its fidelity will be
// believed), and both outrank a number-invalidating failure.
function scoreabilityTier(fidelity) {
  if (!fidelity) return 2;
  if (fidelity.passed === true) return 0;
  const invalidated = NUMBER_INVALIDATING_CHECKS.some(
    (check) => fidelity.checks?.[check] === false
  );
  return invalidated ? 3 : 1;
}

export function selectEvidence(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    // A hand capture is one a person paid for, and a hand corpus exists to show
    // spread (see 2026-08-23-hand): every one is kept, not one per target x brush.
    const key = candidate.handCapture
      ? candidate.relativePath
      : `${candidate.target}:${candidate.brush}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const tiers = group.map((candidate) => scoreabilityTier(candidate.fidelity));
    const bestTier = Math.min(...tiers);
    const representative = group[tiers.indexOf(bestTier)];
    return {
      ...representative,
      fidelityTier: bestTier,
      candidateCount: group.length,
      passingCandidateCount: tiers.filter((tier) => tier === 0).length,
      failedCandidateCount: tiers.filter((tier) => tier === 3).length,
    };
  });
}

// A cell whose best candidate is unreported-or-worse while a number-invalidating
// failure sits in its pool has no scoreable representative, which is a fact to
// surface rather than paper over: the kept capture would be a wrong (or
// unprovable) number waiting to be quoted, and issue 1305's incident was
// exactly one of these arriving looking like its healthy neighbours. Keying the
// refusal on the group rather than the representative alone is deliberate — a
// failed candidate hiding behind an unreported one must not silence the guard.
// Hand captures are exempt: a failed verdict there is itself the calibration
// evidence. Returns the refusal message, or null when promotion may proceed.
// Pure so the policy is testable without the exit.
export function failedRepresentativeProblem(selected, { allowFailed } = {}) {
  const stranded = selected.filter(
    (entry) => !entry.handCapture && entry.fidelityTier >= 2 && entry.failedCandidateCount > 0
  );
  if (!stranded.length || allowFailed) return null;
  const cells = stranded
    .map(
      (entry) =>
        `${entry.target}/${entry.brush} (${entry.failedCandidateCount} of ` +
        `${entry.candidateCount} candidates failed a number-invalidating check; none passed)`
    )
    .join(', ');
  return (
    `no scoreable representative for: ${cells}. Pass --allow-failed to keep one ` +
    'deliberately, or --filter to narrow the promotion to cells that can be scored.'
  );
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
  allowFailed = argFlag('allow-failed') !== undefined || process.argv.includes('--allow-failed'),
  // Overridable so the end-to-end test promotes into a tmpdir instead of the
  // tracked corpus; production callers pass nothing.
  evidenceRoot = EVIDENCE_ROOT,
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
      fidelity: parsed.fidelity ?? null,
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
  const noValidRepresentative = failedRepresentativeProblem(selected, { allowFailed });
  if (noValidRepresentative) fail(noValidRepresentative);
  const destination = join(ROOT, evidenceRoot, campaign);

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
      `${evidenceRoot}/${campaign} already exists. Promoting into it would leave ` +
        'captures this run did not select beside an index that no longer names them, ' +
        'and perf:rescore scores every JSON it finds. Pass --force to replace the ' +
        'corpus, or use a new --campaign name.'
    );
  }
  mkdirSync(destination, { recursive: true });

  // Minified, not copied: a capture is ~2.4 MB pretty-printed and ~620 KB dense,
  // and the tracked corpus is sized in ADR-0138 on the dense form. Nothing is
  // dropped — only the whitespace.
  // The digest makes collisions astronomically unlikely, not impossible — and
  // a collision here is the silent paid-for-capture overwrite this naming
  // exists to prevent, so it fails loudly instead.
  const emitted = new Set();
  for (const entry of selected) {
    const name = evidenceFileName(entry);
    if (emitted.has(name)) {
      fail(`evidence file name collision: ${name} (from ${entry.relativePath})`);
    }
    emitted.add(name);
    writeFileSync(
      join(destination, name),
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
          fidelityPassed: entry.fidelity?.passed ?? null,
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
            : {
                // How rich the pool behind this representative was: "8
                // candidates, 7 passing, 1 failed" reads very differently
                // from "1 candidate" (issue 1305), and the failed count keeps
                // the tri-state a bare passing count collapses — 0 passing of
                // 12 unreported is not 0 passing of 12 failed.
                candidateCount: entry.candidateCount,
                passingCandidateCount: entry.passingCandidateCount,
                failedCandidateCount: entry.failedCandidateCount,
              }),
        })),
      },
      null,
      2
    )
  );

  console.log(
    `Kept ${selected.length} of ${candidates.length} captures in ${evidenceRoot}/${campaign}`
  );
  for (const entry of selected) {
    // The pool counts are meaningful only where the pool exists — a hand
    // capture is always kept alone, and printing 1/1 beside every one would
    // say nothing (the index omits the counts there for the same reason).
    const pool = entry.handCapture
      ? ''
      : `(${entry.passingCandidateCount}/${entry.candidateCount} passing, ` +
        `${entry.failedCandidateCount} failed)  `;
    console.log(
      `  ${entry.target}/${entry.brush}  ${entry.mode}  ` +
        `fidelity=${entry.fidelity?.passed ?? 'unreported'}  ${pool}` +
        `<- ${basename(entry.relativePath)}`
    );
  }
  return { selected, candidates };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await keepCaptureEvidence();
  });
}
