// Shared pass/fail reporter for the smoke tests (run-local-contract.mjs,
// check-deployed-blobs.mjs): check() tallies one assertion, fatal() records an aborting
// error, and summarize() prints the totals and exits non-zero on any failure.

// A fetch failure's own message is only "fetch failed"; the reason (a refused redirect, a DNS
// miss, a refused connection) sits on its cause chain. errorChain() takes each cause's message and
// never the error object, so a request's headers or body cannot reach the log. The cap bounds a
// cyclic chain.
const MAX_CAUSE_DEPTH = 5;
// A message is free text, so a bearer credential (the one the smoke tools send) is masked in every
// line errorChain() returns. The value class is RFC 6750's b64token.
const BEARER_CREDENTIAL = /\b(Bearer)\s+[\w.~+/-]+=*/gi;

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
  const [message, ...causes] = errorChain(err);
  console.error(`\nFATAL: ${message}`);
  for (const reason of causes) console.error(`  caused by: ${reason}`);
}

// The messages fatal() prints, without its tally: for a runner with its own exit rule.
export function errorChain(err) {
  if (!(err instanceof Error)) return [redactBearer(err)];
  return [err.message, ...causeMessages(err)].map(redactBearer);
}

const redactBearer = (text) => String(text).replace(BEARER_CREDENTIAL, '$1 [redacted]');

function causeMessages(err) {
  const reasons = [];
  let cause = err.cause;
  while (cause instanceof Error && reasons.length < MAX_CAUSE_DEPTH) {
    reasons.push(cause.message || cause.code || cause.name);
    cause = cause.cause;
  }
  return reasons;
}

export function summarize() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

export const json = (res) => res.json().catch(() => null);
