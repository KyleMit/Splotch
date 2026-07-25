// Locks in the docs/AUDIT.md surgery in scripts/audit-burndown/lib.mjs — the
// only code allowed to edit the backlog during a burndown run (hundreds of
// sequential edits against one ~19k-line file), so a parsing or seam
// regression here corrupts it silently. The invariants under test: an entry is
// the block from its `### [` heading to the next `### [`/`## ` boundary,
// deletion is a pure block removal that leaves every other byte intact, and
// the file stays dprint-clean (no runs of blank lines) after every deletion.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  countEntries,
  deferralReason,
  deleteFirstEntry,
  findingPriority,
  getEntry,
  resolveImplSha,
} from '../audit-burndown/lib.mjs';

// Built from a line array so the fenced code block inside the first finding
// doesn't fight the template literal.
const FIXTURE_LINES = [
  '# Audit',
  '',
  '> Transient staging for audit findings — test fixture.',
  '',
  '## Source: Code audit — Area one',
  '',
  '### [P1][complexity] First finding',
  '',
  '**File(s):** `web/src/a.ts` — pinned at SHA abc1234',
  '',
  '#### Problem',
  '',
  'First body with a code fence:',
  '',
  '```ts',
  'const kept = 1;',
  '',
  '',
  'const twoBlankLinesAboveAreLegal = true;',
  '```',
  '',
  '---',
  '',
  '### [P2][dead-code] Second finding',
  '',
  '#### Problem',
  '',
  'Second body.',
  '',
  '---',
  '',
  '## Source: Code audit — Area two',
  '',
  '### [P3][readability] Third finding',
  '',
  '#### Problem',
  '',
  'Third body.',
  '',
];
const FIXTURE = FIXTURE_LINES.join('\n');

let dir;
let file;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-lib-'));
  file = join(dir, 'AUDIT.md');
  writeFileSync(file, FIXTURE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const content = () => readFileSync(file, 'utf8');
const missing = () => join(dir, 'nope.md');

describe('countEntries', () => {
  it('counts the bracketed level-3 headings', () => {
    expect(countEntries(file)).toBe(3);
  });

  it('returns null for a missing file', () => {
    expect(countEntries(missing())).toBeNull();
  });
});

describe('getEntry', () => {
  it('returns the first block up to the next entry heading, separator included', () => {
    const entry = getEntry(1, file);
    expect(entry.startsWith('### [P1][complexity] First finding')).toBe(true);
    expect(entry).toContain('pinned at SHA abc1234');
    expect(entry).toContain('twoBlankLinesAboveAreLegal');
    expect(entry).toContain('\n---');
    expect(entry).not.toContain('### [P2]');
  });

  it('ends an entry at a section boundary, not just at the next entry', () => {
    const entry = getEntry(2, file);
    expect(entry.startsWith('### [P2][dead-code] Second finding')).toBe(true);
    expect(entry).not.toContain('## Source');
  });

  it('runs the last entry to end of file', () => {
    expect(getEntry(3, file)).toContain('Third body.');
  });

  it('returns null out of range and for a missing file', () => {
    expect(getEntry(0, file)).toBeNull();
    expect(getEntry(4, file)).toBeNull();
    expect(getEntry(1, missing())).toBeNull();
  });
});

describe('deleteFirstEntry', () => {
  it('is a pure block removal — the next entry is promoted byte-for-byte', () => {
    const secondBefore = getEntry(2, file);
    expect(deleteFirstEntry(file)).toBe(true);
    expect(countEntries(file)).toBe(2);
    expect(getEntry(1, file)).toBe(secondBefore);
    expect(content()).not.toContain('First finding');
  });

  it('leaves headers, section headings, and other findings intact', () => {
    deleteFirstEntry(file);
    const after = content();
    expect(after.startsWith('# Audit\n')).toBe(true);
    expect(after).toContain('## Source: Code audit — Area one');
    expect(after).toContain('## Source: Code audit — Area two');
    expect(after).toContain('Second body.');
    expect(after).toContain('Third body.');
  });

  it('keeps the file dprint-clean after every deletion — no blank-line runs', () => {
    while (countEntries(file) > 0) {
      deleteFirstEntry(file);
      expect(content()).not.toContain('\n\n\n');
    }
  });

  it('drains in order and ends drained files with a single newline', () => {
    deleteFirstEntry(file);
    deleteFirstEntry(file);
    expect(getEntry(1, file).startsWith('### [P3]')).toBe(true);
    deleteFirstEntry(file);
    expect(countEntries(file)).toBe(0);
    expect(content().endsWith('\n')).toBe(true);
    expect(content().endsWith('\n\n')).toBe(false);
  });

  it('returns false and changes nothing on a drained or missing file', () => {
    for (let i = 0; i < 3; i++) deleteFirstEntry(file);
    const drained = content();
    expect(deleteFirstEntry(file)).toBe(false);
    expect(content()).toBe(drained);
    expect(deleteFirstEntry(missing())).toBe(false);
  });
});

// Drives impl-model tiering in burndown.mjs: P4/P5 route to the cheaper model,
// everything else (including an untagged title) stays on the stronger one. A
// regression here silently downgrades the model for consequential findings.
describe('findingPriority', () => {
  it('reads the priority off a normal finding title', () => {
    expect(findingPriority('[P1][complexity] Split initDrawingCanvas')).toBe(1);
    expect(findingPriority('[P4][naming] Comments point to storage.js')).toBe(4);
    expect(findingPriority('[P5][dead-code] Unused export')).toBe(5);
  });

  it('returns null for a title with no [P<n>] tag, so the caller keeps the safe model', () => {
    expect(findingPriority('[dead-code] Unused export')).toBeNull();
    expect(findingPriority('Split initDrawingCanvas')).toBeNull();
    expect(findingPriority('')).toBeNull();
    expect(findingPriority(undefined)).toBeNull();
  });

  it('only reads a leading tag, not a [P<n>] appearing later in the title', () => {
    expect(findingPriority('[dedupe] see the [P2] finding above')).toBeNull();
  });
});

// A missing sha used to mean "roll back and defer", which twice discarded a
// complete, committed, test-passing fix because the implementer just left the
// optional field out of its structured output (~$4 of Opus work in one case).
// git is the source of truth for whether a commit happened; the envelope is not.
describe('resolveImplSha', () => {
  const baseSha = 'a'.repeat(40);
  const head = 'b'.repeat(40);

  it('prefers the sha the implementer reported', () => {
    expect(resolveImplSha({ reported: head, head: 'c'.repeat(40), baseSha })).toBe(head);
  });

  it('recovers a committed fix whose sha the implementer forgot to report', () => {
    expect(resolveImplSha({ reported: '', head, baseSha })).toBe(head);
  });

  it('stays empty when HEAD never moved, so a genuine no-op still defers', () => {
    expect(resolveImplSha({ reported: '', head: baseSha, baseSha })).toBe('');
    expect(resolveImplSha({ reported: '', head: '', baseSha })).toBe('');
  });
});

// The reason lands in a docs/AUDIT-DEFERRED.md commit message that someone
// reads months later to decide whether to re-stage the finding. Attributing a
// tooling failure to the reviewer sends them hunting a quality problem that
// never existed — the same bug class that already bit this driver twice.
describe('deferralReason', () => {
  const gateRed = { reason: 'fix broke the test suite', detail: 'npm run test:unit is red' };

  it('blames the reviewer only for a genuine rejection', () => {
    expect(deferralReason({})).toBe('failed adversarial review');
  });

  it('says the reviewer never ran rather than calling the work rejected', () => {
    expect(deferralReason({ reviewUnavailable: true })).toBe('reviewer unavailable');
  });

  it('names the gate that stayed red', () => {
    expect(deferralReason({ gateRed })).toBe('fix broke the test suite');
  });

  it('names a failed implementer round ahead of an earlier round’s gate result', () => {
    expect(deferralReason({ implFailed: true, gateRed })).toBe(
      'implementer failed to deliver a fix round'
    );
  });

  it('reports an unavailable reviewer ahead of every other cause', () => {
    expect(deferralReason({ reviewUnavailable: true, implFailed: true, gateRed })).toBe(
      'reviewer unavailable'
    );
  });
});
