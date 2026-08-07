import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', 'audit-burndown', 'overnight.mjs');

describe('an invalid finding count', () => {
  it.each(['6OO', '0', '1; echo detached'])('exits 2 before launching for %j', (count) => {
    const result = spawnSync(process.execPath, [SCRIPT, count], {
      encoding: 'utf8',
      env: { ...process.env, AGENT_RUNNER: 'unsupported' },
    });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe(
      `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`
    );
    expect(result.stdout).toBe('');
  });
});
