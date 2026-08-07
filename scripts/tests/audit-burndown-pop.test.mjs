// Locks the mode vocabulary of scripts/audit-burndown/pop.mjs: an unrecognized
// flag must exit 2 rather than falling through to the "print the first entry"
// path, which reported success while the backlog went untouched — the shape that
// makes a typo'd `--delete` indistinguishable from a real pop to a runbook-
// following agent.
//
// pop.mjs chdirs to the real repo root, so every case points AUDIT_FILE at a
// temp backlog; the rejection path exits before any read of it, and the --count
// case only reads.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', 'audit-burndown', 'pop.mjs');

const BACKLOG = `# Audit

## Findings

### [P3][a] First finding

Body one.

### [P3][b] Second finding

Body two.
`;

let dir;
let auditPath;

const pop = (...args) =>
  spawnSync('node', [SCRIPT, ...args], {
    env: { ...process.env, AUDIT_FILE: auditPath },
    encoding: 'utf8',
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-burndown-pop-'));
  auditPath = join(dir, 'AUDIT.md');
  writeFileSync(auditPath, BACKLOG);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('an unrecognized mode', () => {
  it('exits 2, names the mode on stderr, and leaves the backlog untouched', () => {
    const result = pop('--delte');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('pop: unknown mode --delte (see header for usage)');
    expect(result.stdout).toBe('');
    expect(readFileSync(auditPath, 'utf8')).toBe(BACKLOG);
  });
});

describe('a supported mode', () => {
  it('still reports the entry count', () => {
    const result = pop('--count');

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('2');
  });
});
