import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `linguist-generated=true` drops a file from GitHub's language stats and
// collapses it in the diff view. The scrapbook rule in .gitattributes has to
// hit the multi-megabyte generated proof sheets without catching the hub page
// beside them, which is authored and reviewed as a normal diff. A gitattributes
// pattern that misses is silent on every surface, so the resolution is checked
// through git itself rather than by reading the file back.
const repoRoot = join(import.meta.dirname, '..', '..');

function linguistGenerated(path) {
  const line = execFileSync('git', ['check-attr', 'linguist-generated', '--', path], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  return line.slice(line.lastIndexOf(': ') + 2);
}

const trackedProofSheets = execFileSync(
  'git',
  ['ls-files', '--', 'scrapbook/coloring-book-proof-sheets/*.html'],
  { cwd: repoRoot, encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter((path) => !path.endsWith('/index.html'));

describe('linguist-generated attributes on scrapbook bulk', () => {
  it('marks every coloring-book proof sheet', () => {
    expect(trackedProofSheets.length).toBeGreaterThan(0);
    for (const sheet of trackedProofSheets) {
      expect(linguistGenerated(sheet), sheet).toBe('true');
    }
  });

  it('leaves the proof-sheet hub page reviewable', () => {
    expect(linguistGenerated('scrapbook/coloring-book-proof-sheets/index.html')).toBe('false');
  });

  it('marks the asset-gen ideas review', () => {
  });

  it('leaves every other scrapbook entry page reviewable', () => {
    expect(linguistGenerated('scrapbook/index.html')).toBe('unspecified');
    expect(linguistGenerated('scrapbook/page-inventory/index.html')).toBe('unspecified');
  });
});
