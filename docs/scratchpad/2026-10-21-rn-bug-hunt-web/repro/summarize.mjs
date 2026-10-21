import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const lines = (path) =>
  readFileSync(join(out, path), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const findings = lines('findings.jsonl');
assert.equal(new Set(findings.map((f) => f.id)).size, findings.length);
for (const f of findings) {
  assert.equal(f.reproducedTwice, true);
  assert(['S1', 'S2', 'S3', 'S4'].includes(f.severity));
  for (const p of f.evidence) assert(statSync(join(out, p)).isFile(), p);
}
if (!process.argv.includes('--manifest-only')) {
  await import('./blocked-report.mjs');
  await import('./visual-report.mjs');
  await import('./visual-gallery.mjs');
  const ledger = JSON.parse(readFileSync(join(out, 'evidence/latest-verdicts.json'), 'utf8'));
  const visual = JSON.parse(readFileSync(join(out, 'evidence/visual/summary.json'), 'utf8'));
  const verified = existsSync(join(out, 'evidence/visual-verification.json'))
    ? JSON.parse(readFileSync(join(out, 'evidence/visual-verification.json'), 'utf8'))
    : null;
  const complete = visual.compared === 1472 && visual.blocked.length === 0;
  const checks = existsSync(join(out, 'evidence/final-checks-run3.json'))
    ? JSON.parse(readFileSync(join(out, 'evidence/final-checks-run3.json'), 'utf8'))
    : null;
  const active = JSON.parse(readFileSync(join(out, 'evidence/active-run3.json'), 'utf8'));
  const checkSummary = checks
    ? checks.results
        .map((r) => `* ${r.name}: exit ${r.exitCode}; [log](${relative(out, resolve(r.log))}).`)
        .join('\n')
    : 'Final command checks run after capture ends.';
  const positiveLog = checks
    ? 'pointer-positive-final-run3.log.txt'
    : 'pointer-positive-run3.log.txt';
  const negativeLog = checks
    ? 'pointer-negative-final-run3.log.txt'
    : 'pointer-negative-run3.log.txt';
  const table = [
    '| Surface | Case/profile units | Pass | Previously confirmed fail | Blocked |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const engine of ['chromium', 'webkit', 'firefox']) {
    const rows = ledger.filter((r) => r.engine === engine);
    table.push(
      `| ${engine} | ${rows.length} | ${rows.filter((r) => r.status === 'PASS').length} | ${rows.filter((r) => r.status === 'FAIL').length} | ${rows.filter((r) => r.status === 'BLOCKED').length} |`
    );
  }
  const total = {
    pass: ledger.filter((r) => r.status === 'PASS').length,
    fail: ledger.filter((r) => r.status === 'FAIL').length,
    blocked: ledger.filter((r) => r.status === 'BLOCKED').length,
  };
  const nonSettings = visual.clusters.filter((c) => !c.key.startsWith('settings'));
  const newFindings = findings.filter((f) => !['WEB-001', 'WEB-002'].includes(f.id));
  const summary = `# RN web regression hunt summary

Candidate b236d639160459eecd60900926c759af5d4ae080. Run 3 ${complete ? 'capture complete' : 'in progress'}; updated ${new Date().toISOString()}.
The shipping SvelteKit web build and RN export were rebuilt from this worktree. Both build commands
and their post-build guards exited zero. [Build receipts](evidence/build-run3.json) bind the artifacts
to this source. This compares the shipping implementation in this worktree; it does not establish
independent deployed-production equivalence.

Product source is unchanged. Only tests and QA artifacts were edited; no commits, pushes, GitHub
writes or devices were used. All app servers used ports 6150–6189 on 127.0.0.1. The orchestrator's
browser server on 6190 is excluded from cleanup. ${active.serversStopped ? 'All owned servers are stopped; [cleanup receipt](evidence/cleanup-run3.json).' : 'Owned app servers remain active while capture runs.'}

## Functional results

${table.join('\n')}

The combined ledger contains ${ledger.length} latest unique **engine/profile/case** recorder units:
${total.pass} pass, ${total.fail} previously confirmed failures, ${total.blocked} blocked. These are
not independent plan requirements or exhaustive acceptance. Some cases group several assertions;
physical/OS limits and unexecuted axes stay in the [coverage inventory](results/coverage-scope.md).

Run 3 reconciled every one of the previous 38 blocked units: twenty now have passing observations;
eighteen remain blocked by issue #3111, nine downstream AI cases in each of WebKit and Firefox.
The [blocked-case table](results/blocked-run3.md) gives every original unit its resolution or exact
remaining limit. Three offline-shell resolutions reuse the prior same-profile server-loss evidence
and overlap the separately recorded host-loss units; they are not three new independent behaviours.
Raw failed harness takes remain in [observations.jsonl](evidence/observations.jsonl).

The history oracle now expects the shared twenty-step Undo limit after twenty-five commands.
Fresh ready contexts, landed overlays, the current public AI button name and the documented
one-pixel Eraser Undo antialias envelope resolve the other Chromium harness blocks. Firefox's brush
and Farm Magic/Eraser comparisons now complete in fresh contexts; this does not prove an intermittent
retained halo can never occur.

The CSS-zoom surrogate passes only its stated scope: Settings entry, Escape dismissal, a contact
constrained to visible paper and keyboard Undo. Pointer Close remains outside that surrogate viewport.
**Actual browser-chrome zoom and enlarged pointer Close reachability are unproven.**

## Existing findings

* **WEB-001 / issue #3110, S2:** a simulated full-disk IndexedDB preparation failure leaves AI retry
  and reopening blocked until reload. [Existing repro evidence](evidence/ai-quota-recovery.json).
* **WEB-002 / issue #3111, S2:** RN rejects metadata in WebKit's and Firefox's own canvas PNGs before
  upload. [WebKit reader evidence](evidence/webkit-png-reader.json),
  [Firefox reader evidence](evidence/firefox-original-png-reader.json).

These issue reproductions were not retested in run 3, as instructed. The eighteen affected downstream
cases remain blocked by #3111. Chromium's two formerly blocked tablet/desktop success cases use local
fixtures and do not exercise either failure. ${newFindings.length} new confirmed findings were added
in run 3. [findings.jsonl](findings.jsonl) retains the full two-reproduction records and shipping
comparisons. No real generation, credentials or actual full disk was used.

## Drawing-screen visual matrix

[Visual parity report](results/visual-parity.md) · [filterable image gallery](evidence/visual/index.html).

Requested: **1,472 pairs** — Chromium at all nine viewports, WebKit/Firefox at the seven phone and
desktop viewports, each with both themes, Raised/Flat, Button Size 100%/130%, and eight drawing-screen
states. Current: **${visual.recorded} recorded, ${visual.compared} compared,
${visual.blocked.length} blocked, ${visual.unsettled.length} unsettled**.

Each pair has lossless shipping/RN PNGs, a highlighted pixel diff, both DOM receipts and every box
difference >2 CSS px or missing/extra control. Raw exact pixel differences, thresholded differences
(maximum RGB channel delta >16) and mean channel differences are retained. DPR 1, engine-default user
agents, touch-enabled phone/tablet viewports and no notch emulation are identical within each pair.
The matrix establishes responsive viewport comparisons; physical-device/browser-identity acceptance
remains separate.

${nonSettings.length === 0 ? 'No measured drawing-control box differs by more than 2 px in the compared pairs.' : 'The report lists ' + nonSettings.length + ' non-Settings geometry difference categories.'}
The first 448-pair WebKit pass is preserved under evidence/visual-discarded and excluded from these
counts. Its request guard wrongly blocked same-origin blob images. The accepted WebKit pass permits
those local resources and waits for decoded shipping coloring art; all arms deny remote/API requests.

Settings hub typography and row geometry, backdrop blur and coloring-art rasterization are documented
as numerical observations. A difference becomes a finding only after two reproductions establish a
user-visible disadvantage under the owner's “whatever is better” rule. The
[adjudication notes](results/visual-adjudication.md) name the samples actually inspected; manual review
is representative, not a claim that every pixel of every pair was judged by eye.

${verified ? `[Visual integrity verification](evidence/visual-verification.json) validates ${verified.verifiedPairs} pair IDs, image dimensions and hashes, settled frames, held-drag receipts, recalculated box lists and fixture changes in bounds/decoded pixels.` : 'The complete-matrix integrity verifier runs after capture ends.'}

## Regression tests and checks

Three passing regressions extend
[native-paper-input-web.test.mjs](../../../tools/tests/native-paper-input-web.test.mjs): cancel all
held contacts on window blur and accept a fresh stroke; keep the peer active when one contact is
canceled; retain the latest pointer position when a coalesced batch omits the current endpoint.
The targeted file passes **14 tests**. Every added case fails its intended assertion against a
separate copied-source deliberate break. Production source is never mutated by the negative controls.

* [Run 3 positive test log](evidence/${positiveLog}).
* [Three negative controls](evidence/${negativeLog}),
  [coalesced endpoint assertion](evidence/pointer-negative-coalesced-tail.log.txt).
* [Run 3 lint](evidence/lint-run3.log.txt) exits zero with two baseline warnings.

${checkSummary}

The first full-format check caught the check runner's own incrementally written JSON receipt.
The writer was corrected to format each update; the final formatting recheck is recorded separately
without deleting the failed attempt.

${existsSync(join(out, 'evidence/verification-run3.json')) ? '[Evidence integrity verification](evidence/verification-run3.json) checks local Markdown targets, screenshot references, artifact tracking, source scope and build hashes.' : 'The final evidence integrity receipt is written when the run closes.'}

## Residual scope

Spoken screen readers, audible sound/haptics, OS install UI, real pen/touch fidelity, real quota
exhaustion, process eviction, actual browser-chrome zoom and the complete auto-save/folder-picker
matrix remain unproven. Update/visibility/install/storage/media fixtures are labelled substitutes,
not proof of those OS properties. Read [coverage-scope.md](results/coverage-scope.md) for each plan
row's remaining axes. Only the / drawing app was tested; information routes were excluded.

See [status.md](status.md) for timestamped phases, corrections and discarded takes, and
[evidence/manifest.json](evidence/manifest.json) for file hashes.
`;
  writeFileSync(join(out, 'summary.md'), summary);
}
const files = [];
function inventory(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory() || (e.isSymbolicLink() && statSync(path).isDirectory())) inventory(path);
    else if (path !== join(out, 'evidence/manifest.json')) {
      const bytes = readFileSync(path);
      files.push({
        path: relative(out, path),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
}
inventory(out);
writeFileSync(
  join(out, 'evidence/manifest.json'),
  JSON.stringify({ at: new Date().toISOString(), files }, null, 2) + '\n'
);
console.log(JSON.stringify({ files: files.length, findings: findings.length }));
