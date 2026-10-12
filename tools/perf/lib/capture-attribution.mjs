// The one statement of the probe-nonce contract (issue 1356). The mint, the
// report-URL parse, and the attribution predicate used to live as three
// independent restatements — two mints in the split-capture runners, a
// module-private predicate in the CI sweep — with nothing failing on drift.
// Every producer and reader now imports this module, and the drift guard in
// corpus-attribution.test.mjs proves a minted nonce satisfies the predicate.

// A probe nonce is `${label}-${pid}-${counter}`. Only a page opened at a URL
// carrying the nonce can prove which run it belongs to, which is why the
// format is load-bearing: attribution demands the label followed by EXACTLY
// `-<digits>-<digits>` (see nonceAttributableToLabel).
export function mintProbeNonce(runLabel) {
  return `${runLabel}-${process.pid}-${Math.round(performance.now())}`;
}

// The nonce a capture's own report carries — from the ?probe= param of the URL
// the page was opened at. `null` is not a failure: Appium, desktop, native,
// and hand captures carry no probe param, and their attribution rests on
// other guards (page-identity assertions, the operator harness's UA check).
// That boundary is deliberate and this is where it is stated.
export function reportNonce(artifact) {
  const url = artifact?.report?.meta?.url ?? '';
  const match = /[?&]probe=([^&]*)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// Attribution demands the label followed by EXACTLY `-<digits>-<digits>`: a
// bare prefix match would attribute a `…-pen-undo` nonce to a `…-pen` label,
// and an unanchored tail would attribute a `magic-light-3` repeat's nonce to a
// hypothetical `magic-light` label — the numeric-suffix naming the tracked
// repeat sets already use.
export function nonceAttributableToLabel(nonce, label) {
  if (!label) return false;
  if (!nonce.startsWith(`${label}-`)) return false;
  return /^\d+-\d+$/.test(nonce.slice(label.length + 1));
}

// What a promotion stamps into the index (issue 1356): computed from the
// artifact's own report URL, never hand-typed. `cellAttributable: null` means
// the capture is structurally outside the nonce audit (no probe param), which
// readers must not conflate with `false` (nonce contradicts label).
export function attributionOf(artifact) {
  const nonce = reportNonce(artifact);
  if (nonce === null) return { reportNonce: null, cellAttributable: null };
  return {
    reportNonce: nonce,
    cellAttributable: nonceAttributableToLabel(nonce, artifact?.label ?? ''),
  };
}
