import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const skeletonBin = fileURLToPath(
  new URL('../../.claude/skills/analyze-session-transcripts/skeleton.mjs', import.meta.url)
);

const dirs = [];

function skeletonFor(records) {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-transcript-skeleton-'));
  dirs.push(dir);
  const transcript = join(dir, 'session.jsonl');
  const content = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  writeFileSync(transcript, content);
  const output = execFileSync(process.execPath, [skeletonBin, transcript], { encoding: 'utf8' });
  return { content, output };
}

function frontMatterValue(output, key) {
  const line = output.split('\n').find((l) => l.startsWith(`${key}: `));
  return line?.slice(`${key}: `.length);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('skeleton front matter', () => {
  it('serializes a number-only PR reference as a quoted YAML scalar, not a comment', () => {
    const { output } = skeletonFor([
      {
        type: 'user',
        sessionId: 'abc',
        prNumber: 916,
        timestamp: '2026-08-10T12:00:00.000Z',
        message: { content: [{ type: 'text', text: 'hello' }] },
      },
    ]);
    expect(frontMatterValue(output, 'pr')).toBe('"#916"');
    expect(JSON.parse(frontMatterValue(output, 'pr'))).toBe('#916');
  });

  it('quotes every string scalar', () => {
    const { output } = skeletonFor([
      {
        type: 'user',
        sessionId: 'abc',
        gitBranch: 'feat/x',
        timestamp: '2026-08-10T12:00:00.000Z',
        message: { content: [{ type: 'text', text: 'hello' }] },
      },
    ]);
    for (const key of ['session_id', 'agent', 'git_branch', 'started', 'pr']) {
      expect(frontMatterValue(output, key)).toMatch(/^".*"$/);
    }
  });
});
