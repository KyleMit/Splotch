import { describe, expect, it } from 'vitest';
import {
  adrIndexEntries,
  adrLinks,
  adrNumber,
  collisionsAgainstBase,
  duplicateNumbers,
  formatProblems,
  headingMismatches,
  headingNumber,
  indexIntegrity,
  malformedRecordNames,
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

describe('malformedRecordNames', () => {
  it('passes names that parse as records', () => {
    expect(malformedRecordNames(['0081-fine.md', 'README.md', 'assets'])).toEqual([]);
  });

  it('reports a numbered name that does not parse, so it cannot vanish silently', () => {
    expect(
      malformedRecordNames(['0081-Mixed-Case.md', '0082-two--dashes.md', '0083 spaced.md'])
    ).toEqual(['0081-Mixed-Case.md', '0082-two--dashes.md', '0083 spaced.md']);
  });

  it('does not fault a file that never claimed to be a record', () => {
    expect(malformedRecordNames(['README.md', 'notes.txt'])).toEqual([]);
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
    expect(collisionsAgainstBase(['0080-base.md'], ['0081-new.md'])).toEqual([]);
  });

  it('accepts a branch that adds no record at all', () => {
    expect(collisionsAgainstBase(['0080-base.md'], [])).toEqual([]);
  });

  it('catches a number the base spends on a different record', () => {
    expect(collisionsAgainstBase(['0081-landed-first.md'], ['0081-ours.md'])).toEqual([
      { number: '0081', baseFile: '0081-landed-first.md', headFile: '0081-ours.md' },
    ]);
  });

  // A retitle reaches this function as an empty added set, because the caller
  // resolves additions with rename-aware git. Deriving additions from filename
  // identity instead made a retitle indistinguishable from a colliding new
  // record, and told the author to renumber a record whose number was never wrong.
  it('does not fault a retitled record, which contributes no addition', () => {
    expect(collisionsAgainstBase(['0081-old-title.md'], [])).toEqual([]);
  });

  it('does not fault a record the base already holds under the same name', () => {
    expect(collisionsAgainstBase(['0081-same.md'], ['0081-same.md'])).toEqual([]);
  });

  it('reports every colliding addition', () => {
    expect(collisionsAgainstBase(['0081-a.md', '0082-b.md'], ['0081-x.md', '0082-y.md'])).toEqual([
      { number: '0081', baseFile: '0081-a.md', headFile: '0081-x.md' },
      { number: '0082', baseFile: '0082-b.md', headFile: '0082-y.md' },
    ]);
  });
});

describe('headingNumber', () => {
  it('reads the number out of a record heading', () => {
    expect(headingNumber('# ADR-0081: Some Decision')).toBe('0081');
  });

  it('returns null for a heading that names no record', () => {
    expect(headingNumber('# Some Decision')).toBeNull();
    expect(headingNumber('')).toBeNull();
    expect(headingNumber(undefined)).toBeNull();
  });
});

describe('headingMismatches', () => {
  it('passes a record whose heading matches its filename', () => {
    expect(headingMismatches([{ file: '0081-a.md', firstLine: '# ADR-0081: A' }])).toEqual([]);
  });

  it('catches a heading that claims a different number than the filename', () => {
    expect(headingMismatches([{ file: '0081-a.md', firstLine: '# ADR-0079: A' }])).toEqual([
      { file: '0081-a.md', expected: '0081', found: '0079' },
    ]);
  });

  it('catches a record with no ADR heading at all', () => {
    expect(headingMismatches([{ file: '0081-a.md', firstLine: '# A' }])).toEqual([
      { file: '0081-a.md', expected: '0081', found: null },
    ]);
  });
});

describe('adrIndexEntries', () => {
  it('reads canonical Start here and table entries without counting cross-references', () => {
    const markdown = `
* **[0001 — One](0001-one.md)** — amended by [0002](0002-two.md).

| # | Title | Status |
| - | ----- | ------ |
| [0002](0002-two.md) | Two | Active (amends [0001](0001-one.md)) |
`;

    expect(adrIndexEntries(markdown)).toEqual([
      { number: '0001', file: '0001-one.md', line: 2 },
      { number: '0002', file: '0002-two.md', line: 6 },
    ]);
  });

  it('ignores Historical bare-number rows and their moved-record links', () => {
    const markdown =
      '| 0053 | Asset-Generation Pipeline | Moved to [asset-gen docs](../../tools/asset-gen/docs/architecture.md) |';

    expect(adrIndexEntries(markdown)).toEqual([]);
    expect(adrLinks(markdown)).toEqual([]);
    expect(indexIntegrity([], markdown)).toEqual({
      missing: [],
      duplicates: [],
      mismatches: [],
      unknown: [],
    });
  });

  it('ignores canonical-looking examples inside backtick and tilde fences', () => {
    const markdown = `\`\`\`markdown
| [0001](0001-one.md) | One | Active |
\`\`\`
~~~markdown
* **[0002 — Two](0002-two.md)**
~~~`;

    expect(adrIndexEntries(markdown)).toEqual([]);
    expect(adrLinks(markdown)).toEqual([]);
  });

  it('normalizes relative prefixes and fragments in canonical targets', () => {
    const markdown = '| [0001](./0001-one.md#context) | One | Active |';

    expect(adrIndexEntries(markdown)).toEqual([{ number: '0001', file: '0001-one.md', line: 1 }]);
  });
});

describe('indexIntegrity', () => {
  it('passes when every record has one correctly numbered canonical entry', () => {
    const markdown = `| [0001](0001-one.md) | One | Active |
| [0002](0002-two.md) | Two | Active |`;

    expect(indexIntegrity(['0001-one.md', '0002-two.md', 'README.md'], markdown)).toEqual({
      missing: [],
      duplicates: [],
      mismatches: [],
      unknown: [],
    });
  });

  it('reports a record missing from the index', () => {
    expect(indexIntegrity(['0001-one.md'], '# Architectural Decision Records').missing).toEqual([
      '0001-one.md',
    ]);
  });

  it('reports every canonical entry when a record is indexed more than once', () => {
    const markdown = `| [0001](0001-one.md) | One | Active |
| [0001](0001-one.md) | One again | Active |`;

    expect(indexIntegrity(['0001-one.md'], markdown).duplicates).toEqual([
      {
        file: '0001-one.md',
        entries: [
          { number: '0001', file: '0001-one.md', line: 1 },
          { number: '0001', file: '0001-one.md', line: 2 },
        ],
      },
    ]);
  });

  it('reports link text whose number disagrees with its target filename', () => {
    const markdown = '| [0078](0082-resident-snapshot-tier-byte-budget.md) | Budget | Active |';

    expect(
      indexIntegrity(['0082-resident-snapshot-tier-byte-budget.md'], markdown).mismatches
    ).toEqual([
      {
        number: '0078',
        expected: '0082',
        file: '0082-resident-snapshot-tier-byte-budget.md',
        line: 1,
      },
    ]);
  });

  it('checks a Status-cell cross-reference without counting it as a canonical entry', () => {
    const markdown = `| [0001](0001-one.md) | One | Superseded by [0002](0003-three.md) |
| [0003](0003-three.md) | Three | Active |`;

    const integrity = indexIntegrity(['0001-one.md', '0003-three.md'], markdown);
    expect(integrity.duplicates).toEqual([]);
    expect(integrity.mismatches).toEqual([
      { number: '0002', expected: '0003', file: '0003-three.md', line: 1 },
    ]);
  });

  it('reports a nonexistent target from a Status-cell cross-reference', () => {
    const markdown = '| [0001](0001-one.md) | One | Superseded by [0002](0002-missing.md) |';

    expect(indexIntegrity(['0001-one.md'], markdown).unknown).toEqual([
      { number: '0002', file: '0002-missing.md', line: 1 },
    ]);
  });

  it('accepts relative prefixes and fragments as equivalent local ADR targets', () => {
    const markdown = '| [0001](./0001-one.md#context) | One | Active |';

    expect(indexIntegrity(['0001-one.md'], markdown)).toEqual({
      missing: [],
      duplicates: [],
      mismatches: [],
      unknown: [],
    });
  });

  it('reports an ADR target whose link text has no canonical four-digit label', () => {
    const markdown = '| [0001 - One](0001-one.md) | One | Active |';

    expect(indexIntegrity(['0001-one.md'], markdown).mismatches).toEqual([
      { number: null, expected: '0001', file: '0001-one.md', line: 1 },
    ]);
  });

  it('reports a canonical entry whose target is not an ADR record', () => {
    const markdown = '| [0099](0099-missing.md) | Missing | Active |';

    expect(indexIntegrity([], markdown).unknown).toEqual([
      { number: '0099', file: '0099-missing.md', line: 1 },
    ]);
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
  it('names the duplicate, the base collision, and the heading mismatch', () => {
    const lines = formatProblems({
      duplicates: [{ number: '0077', files: ['0077-a.md', '0077-b.md'] }],
      collisions: [{ number: '0081', baseFile: '0081-theirs.md', headFile: '0081-ours.md' }],
      mismatches: [{ file: '0082-c.md', expected: '0082', found: '0079' }],
      baseRef: 'origin/main',
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('0077-a.md, 0077-b.md');
    expect(lines[1]).toContain('origin/main');
    expect(lines[2]).toContain('ADR-0079');
  });

  it('says a record is missing its heading rather than naming a number', () => {
    const [line] = formatProblems({
      duplicates: [],
      collisions: [],
      mismatches: [{ file: '0082-c.md', expected: '0082', found: null }],
      baseRef: 'origin/main',
    });
    expect(line).toContain('no ADR-NNNN heading');
  });

  it('says nothing when the numbering is clean', () => {
    expect(
      formatProblems({ duplicates: [], collisions: [], mismatches: [], baseRef: 'origin/main' })
    ).toEqual([]);
  });

  it('names missing, duplicate, mismatched, and unknown index entries', () => {
    const lines = formatProblems({
      duplicates: [],
      collisions: [],
      mismatches: [],
      index: {
        missing: ['0081-missing.md'],
        duplicates: [
          {
            file: '0082-twice.md',
            entries: [
              { number: '0082', file: '0082-twice.md', line: 10 },
              { number: '0082', file: '0082-twice.md', line: 20 },
            ],
          },
        ],
        mismatches: [{ number: '0078', expected: '0083', file: '0083-mismatch.md', line: 30 }],
        unknown: [{ number: '0084', file: '0084-unknown.md', line: 40 }],
      },
      baseRef: 'origin/main',
    });

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('no entry in a canonical index position');
    expect(lines[1]).toContain('lines 10, 20');
    expect(lines[2]).toContain('ADR-0078');
    expect(lines[3]).toContain('not an ADR record');
  });

  it('describes an index link label that has no canonical four-digit number', () => {
    const [line] = formatProblems({
      duplicates: [],
      collisions: [],
      mismatches: [],
      index: {
        missing: [],
        duplicates: [],
        mismatches: [{ number: null, expected: '0001', file: '0001-one.md', line: 5 }],
        unknown: [],
      },
      baseRef: 'origin/main',
    });

    expect(line).toContain('something other than a four-digit ADR number');
  });
});
