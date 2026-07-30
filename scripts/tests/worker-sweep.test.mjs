import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { allowedTokensList, managedAccessTokenForRetry } from '../../web/playwright.shared.ts';

// .github/workflows/worker-sweep.yml is the manual-dispatch flake/wall-clock
// sweep behind ADR-0078's worker count. It starts its own preview server and runs
// the suite against it, which puts it outside everything playwright.config.ts
// arranges — so the two things the config does for a measurement run have to be
// re-done by hand there, and both were missing the first time the sweep ran:
// the server's managed-code allowlist, and unsetting CI so the run measures the
// unretried flake rate against a reused server.
//
// YAML can't import the TypeScript that owns the allowlist, so this guard reads
// both sides (the pattern in CLAUDE.md, "Cross-file agreement is never
// maintained by prose").
const workflow = readFileSync(
  join(import.meta.dirname, '..', '..', '.github', 'workflows', 'worker-sweep.yml'),
  'utf8'
);

// The strictest list the config ever hands its own server: the managed code plus
// one per retry attempt, plus the harness probe code allowedTokensList() appends.
// A sweep runs with retries off and needs only the first and last, but matching
// the CI list keeps the server correct whatever the run turns on.
const CI_RETRIES = 2;
const expectedTokens = allowedTokensList(
  ...Array.from({ length: CI_RETRIES + 1 }, (_, retry) => managedAccessTokenForRetry(retry))
);

describe('worker sweep workflow', () => {
  it('hands the preview server the allowlist playwright.shared.ts computes', () => {
    const declared = workflow.match(/^\s*ALLOWED_TOKENS_LIST=(\S+)/m)?.[1];
    expect(
      declared,
      'the sweep starts its own preview server, so it must declare ALLOWED_TOKENS_LIST itself'
    ).toBe(expectedTokens);
  });

  it('runs the suite with CI unset', () => {
    // CI on would turn on the two branches that corrupt the measurement:
    // `retries: 2` masks the flake rate the sweep exists to measure, and
    // `reuseExistingServer: false` rebuilds per rep instead of reusing the
    // server started above.
    expect(workflow).toMatch(/env -u CI\b/);
  });
});
