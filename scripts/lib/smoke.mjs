// Shared pass/fail reporter for the smoke tests (api-smoke.mjs,
// blobs-smoke.mjs): check() tallies one assertion, fatal() records an aborting
// error, and summarize() prints the totals and exits non-zero on any failure.

let passed = 0;
let failed = 0;

export function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

export function fatal(err) {
  failed++;
  console.error(`\nFATAL: ${err.message}`);
}

export function summarize() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

export const json = (res) => res.json().catch(() => null);
