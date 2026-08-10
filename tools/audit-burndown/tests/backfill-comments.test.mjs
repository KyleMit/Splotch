// Locks the `done <sha>` ambiguity guard in tools/audit-burndown/backfill-comments.mjs:
// an unresolvable prefix must refuse to touch the store rather than silently
// dropping every matching record while recording only one in POSTED (the bug
// this guard replaced — see docs/AUDIT.md history for the finding).
//
// The script chdirs to the real repo root and (on the success paths) appends to
// the live .audit-work/posted-comments.log and .audit-work/logs/run.log, which
// are this repo's actual in-flight audit-burndown state — not something a test
// may touch. The ambiguous-prefix branch this test drives exits before any of
// writeStore/appendFileSync/logLine run, so it is the only mode safe to spawn
// for real; it is not paired with a single-match success case for that reason.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', 'backfill-comments.mjs');

let dir;
let storePath;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'backfill-comments-'));
  storePath = join(dir, 'pending-comments.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('done <sha> with an ambiguous prefix', () => {
  it('exits non-zero, reports the match count, and leaves the store untouched', () => {
    const record = (sha) => ({ sha, title: 't', problem: 'p', fix: 'f' });
    const contents = `${[
      JSON.stringify(record('aaaaaaa1111111111111111111111111111111')),
      JSON.stringify(record('aaaaaaa2222222222222222222222222222222')),
    ].join('\n')}\n`;
    writeFileSync(storePath, contents);

    const result = spawnSync('node', [SCRIPT, 'done', 'aaaaaaa'], {
      env: { ...process.env, COMMENT_STORE: storePath },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ambiguous prefix aaaaaaa matches 2 pending records');
    expect(readFileSync(storePath, 'utf8')).toBe(contents);
  });
});
