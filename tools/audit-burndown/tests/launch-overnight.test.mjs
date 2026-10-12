import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', 'launch-overnight.mjs');

// An unsupported runner fails preflight before any auth or git probe, so a count that passes
// validation ends there instead of launching a detached run.
function launch(argv) {
  return spawnSync(process.execPath, [SCRIPT, ...argv], {
    encoding: 'utf8',
    env: { ...process.env, AGENT_RUNNER: 'unsupported' },
  });
}

describe('an invalid finding count', () => {
  it.each(['6OO', '0', '01', '0600', '99999999999999999999', '1; echo detached'])(
    'exits 2 before launching for %j',
    (count) => {
      const result = launch([count]);

      expect(result.status).toBe(2);
      expect(result.stderr.trim()).toBe(
        `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`
      );
      expect(result.stdout).toBe('');
    }
  );
});

describe('a valid finding count', () => {
  it.each([
    { label: 'an explicit 600', argv: ['600'] },
    { label: 'the default', argv: [] },
  ])('reaches preflight for $label', ({ argv }) => {
    const result = launch(argv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unsupported AGENT_RUNNER: unsupported');
    expect(result.stderr).toContain('preflight failed — not launching');
    expect(result.stderr).not.toContain('finding count must be a positive integer');
  });
});

describe('preflight', () => {
  // readConfig refuses RETRIES=0 after it parses MAX_ISSUES, so this run stops inside preflight
  // before any probe; an unsupported runner is refused first and would hide which MAX_ISSUES
  // preflight read. The env holds only these two knobs, so no knob inherited from the test runner
  // can be refused first either.
  it('validates the positional count in place of an inherited MAX_ISSUES', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '5'], {
      encoding: 'utf8',
      env: { MAX_ISSUES: '', RETRIES: '0' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RETRIES must be an integer >= 1; received "0"');
    expect(result.stderr).toContain('preflight failed — not launching');
    expect(result.stderr).not.toContain('MAX_ISSUES');
    expect(result.stdout).toBe('');
  });
});
