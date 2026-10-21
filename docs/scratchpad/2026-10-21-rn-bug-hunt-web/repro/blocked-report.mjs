import { readFileSync, writeFileSync } from 'node:fs';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const original = JSON.parse(readFileSync(`${out}/evidence/latest-verdicts-run2.json`, 'utf8'));
const latest = new Map();
for (const r of readFileSync(`${out}/evidence/observations.jsonl`, 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse)) {
  if (!/diagnostic/i.test(r.id)) latest.set(`${r.engine}/${r.profile}/${r.id}`, r);
}
const key = (r) => `${r.engine}/${r.profile}/${r.id}`;
const adjudicated = [...latest.values()].map((r) => {
  const result = { ...r, recordedStatus: r.status };
  if (['webkit', 'firefox'].includes(r.engine) && r.id === 'A01-A03-A08-fixture-success') {
    result.status = 'FAIL';
    result.adjudication = 'Previously reproduced WEB-002 / issue #3111. No run-3 retest.';
  } else if (r.id === 'W13-ai-idb-quota' && r.engine === 'chromium') {
    result.status = 'FAIL';
    result.adjudication = 'Previously reproduced WEB-001 / issue #3110. No run-3 retest.';
  } else if (
    r.status === 'BLOCKED' &&
    ['webkit', 'firefox'].includes(r.engine) &&
    /^A0[4-7]|^W13/.test(r.id)
  )
    result.adjudication =
      'Blocked by #3111 before the intended fixture or assertions can be reached. No retest while fixes are in progress.';
  else if (r.status === 'BLOCKED' && r.id === 'W03-W14-offline-shell') {
    const alternative = latest.get(`${r.engine}/${r.profile}/W03-W14-offline-host-loss`);
    if (alternative?.status === 'PASS') {
      result.status = 'PASS';
      result.adjudication =
        'Resolved by the existing same-profile server-loss harness: app reloads under a controlling worker after the owned server stops. The engine offline-toggle navigation error is retained as a discarded mechanism, not a product block. OS airplane mode remains untested.';
      result.alternativeEvidence = alternative.evidence;
    }
  }
  return result;
});
writeFileSync(`${out}/evidence/latest-verdicts.json`, JSON.stringify(adjudicated, null, 2) + '\n');
const current = new Map(adjudicated.map((r) => [key(r), r]));
let md =
  '# Run 3 blocked-case reconciliation\n\nThe previous ledger contained 38 blocked case/profile units: Chromium 12, WebKit 13, Firefox 13. Each original unit is listed once below. Previous failed attempts stay in the raw observation log. A resolved harness block is a pass only for the assertions reported; the plan inventory retains unobserved axes. Issue #3111 flows and the #3110 storage-recovery repro were not retested.\n\n| Engine | Previous blocked | Now pass | Still blocked |\n| --- | ---: | ---: | ---: |\n';
for (const engine of ['chromium', 'webkit', 'firefox']) {
  const r = original
    .filter((r) => r.engine === engine && r.status === 'BLOCKED')
    .map((r) => current.get(key(r)));
  md += `| ${engine} | ${r.length} | ${r.filter((r) => r.status === 'PASS').length} | ${r.filter((r) => r.status === 'BLOCKED').length} |\n`;
}
md +=
  '\n| Engine/profile/case | Result | Resolution or exact remaining limit | Evidence |\n| --- | --- | --- | --- |\n';
for (const before of original.filter((r) => r.status === 'BLOCKED')) {
  const after = current.get(key(before));
  let reason = after.adjudication;
  if (!reason && after.status === 'PASS') {
    if (before.id === 'D11-deep-history')
      reason =
        'The original oracle expected 25 Undo units; the shared cap is 20. Corrected 25-command fixture observes exactly 20 Undo steps.';
    else if (before.id === 'D09-custom-color')
      reason =
        'Wait for the picker entrance to land before pointer selection; custom ink differs from Purple and picker reopens.';
    else if (before.id === 'D02-D05-brush-ink-undo')
      reason =
        'Fresh ready screen; paced brush paths and quiet-frame comparisons. Eraser Undo uses the documented one-pixel AA envelope with original/restored images retained.';
    else if (before.id === 'D04-D05-page-magic-eraser-theme')
      reason =
        'Fresh ready page, paced Magic/Eraser paths and quiet frames; light/dark art and Undo assertions complete.';
    else if (before.id === 'X06-undo-shortcut')
      reason =
        'A fresh context prevents a duplicate Undo-labelled Settings toggle from entering the root Undo locator. Keyboard undo and modal ink protection pass.';
    else if (before.id === 'A01-A03-A08-fixture-success')
      reason =
        'Current public AI button name and fresh context; held local fixture, minimize/draw/restore, report fixture and saved original/result receipts pass. This Chromium success path does not exercise #3110/#3111.';
    else if (before.id === 'D12-short-full-clear-drag')
      reason =
        'Compare retained/restored ink using the one-pixel AA envelope; short drag preserves, full drag clears and Undo restores.';
    else if (before.id.endsWith('cssZoom200'))
      reason =
        'Use Escape to dismiss the enlarged Settings card, draw only in the visible paper intersection, then keyboard Undo. CSS surrogate only; real browser chrome zoom is inaccessible through this Playwright connection.';
  }
  if (!reason)
    reason = (after.detail?.error ?? 'No browser verdict recorded')
      .replaceAll('|', '/')
      .replaceAll('\n', ' ');
  md += `| ${key(before)} | ${after.status} | ${reason} | [receipt](../${after.alternativeEvidence ?? after.evidence}) |\n`;
}
md +=
  '\nThe three server-loss resolutions reuse previous-run evidence and overlap the separately listed host-loss units; they are not three new independent behaviours. Counts describe recorder case/profile units. Physical pen/multitouch fidelity in non-CDP engines, screen-reader speech, audible sound/haptics, OS install UI, process eviction, real quota exhaustion and actual browser-chrome zoom are not observable through screenshots/DOM and this remote automation protocol. Synthetic media, visibility, installation, zoom or storage fixtures cannot prove those physical/OS properties.\n';
writeFileSync(`${out}/results/blocked-run3.md`, md);
console.log(
  JSON.stringify(Object.groupBy(adjudicated, (r) => r.engine)) === ''
    ? ''
    : JSON.stringify(
        ['chromium', 'webkit', 'firefox'].map((engine) => {
          const r = adjudicated.filter((r) => r.engine === engine);
          return {
            engine,
            units: r.length,
            pass: r.filter((r) => r.status === 'PASS').length,
            fail: r.filter((r) => r.status === 'FAIL').length,
            blocked: r.filter((r) => r.status === 'BLOCKED').length,
          };
        })
      )
);
