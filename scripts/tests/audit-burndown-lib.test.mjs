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
import { countEntries, deleteFirstEntry, getEntry } from '../audit-burndown/lib.mjs';

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
