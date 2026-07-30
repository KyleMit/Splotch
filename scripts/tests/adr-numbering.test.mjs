import { describe, expect, it } from 'vitest';
import {
  adrNumber,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
  nextAdrNumber,
} from '../lib/adr-numbering.mjs';

describe('adrNumber', () => {
  it('reads the four-digit prefix off a record filename', () => {
    expect(adrNumber('0077-three-phase-release-verified-artifact-publish.md')).toBe('0077');
  });

  it('ignores the index and other non-record files', () => {
    expect(adrNumber('README.md')).toBeNull();
    expect(adrNumber('assets')).toBeNull();
    expect(adrNumber('77-too-few-digits.md')).toBeNull();
  });
});

describe('duplicateNumbers', () => {
  it('passes a set where every number is held once', () => {
    expect(duplicateNumbers(['0076-a.md', '0077-b.md', 'README.md'])).toEqual([]);
  });

  it('reports a number two records share', () => {
    const duplicates = duplicateNumbers([
      '0077-dependabot-claude-review-workflow.md',
      '0077-three-phase-release-verified-artifact-publish.md',
      '0079-solo.md',
    ]);
    expect(duplicates).toEqual([
      {
        number: '0077',
        files: [
          '0077-dependabot-claude-review-workflow.md',
          '0077-three-phase-release-verified-artifact-publish.md',
        ],
      },
    ]);
  });

  it('reports each shared number separately', () => {
    const duplicates = duplicateNumbers(['0077-a.md', '0077-b.md', '0078-c.md', '0078-d.md']);
    expect(duplicates.map(({ number }) => number)).toEqual(['0077', '0078']);
  });
});

describe('collisionsAgainstBase', () => {
  it('accepts a branch that takes the next free number', () => {
    expect(collisionsAgainstBase(['0080-base.md'], ['0080-base.md', '0081-new.md'])).toEqual([]);
  });

  it('accepts a branch that leaves the base untouched', () => {
    expect(collisionsAgainstBase(['0080-base.md'], ['0080-base.md'])).toEqual([]);
  });

  it('catches a number the base spends on a different record', () => {
    expect(
      collisionsAgainstBase(['0081-landed-first.md'], ['0081-landed-first.md', '0081-ours.md'])
    ).toEqual([{ number: '0081', baseFile: '0081-landed-first.md', headFile: '0081-ours.md' }]);
  });

  it('catches the collision even when the tree under test omits the base record', () => {
    expect(collisionsAgainstBase(['0081-landed-first.md'], ['0081-ours.md'])).toEqual([
      { number: '0081', baseFile: '0081-landed-first.md', headFile: '0081-ours.md' },
    ]);
  });

  it('does not fault a record the branch renames in place', () => {
    expect(collisionsAgainstBase(['0081-old-title.md'], ['0081-old-title.md'])).toEqual([]);
  });
});

describe('nextAdrNumber', () => {
  it('counts from the highest number in use, not the number of records', () => {
    const withGap = ['0001-a.md', '0080-b.md', 'README.md'];
    expect(nextAdrNumber(withGap)).toBe('0081');
  });

  it('starts at 0001 for an empty directory', () => {
    expect(nextAdrNumber(['README.md'])).toBe('0001');
  });
});

describe('formatProblems', () => {
  it('names both the duplicate and the base collision', () => {
    const lines = formatProblems({
      duplicates: [{ number: '0077', files: ['0077-a.md', '0077-b.md'] }],
      collisions: [{ number: '0081', baseFile: '0081-theirs.md', headFile: '0081-ours.md' }],
      baseRef: 'origin/main',
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('0077-a.md, 0077-b.md');
    expect(lines[1]).toContain('origin/main');
  });

  it('says nothing when the numbering is clean', () => {
    expect(formatProblems({ duplicates: [], collisions: [], baseRef: 'origin/main' })).toEqual([]);
  });
});
