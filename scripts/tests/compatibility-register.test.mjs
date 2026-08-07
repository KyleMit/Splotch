import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/COMPATIBILITY.md's API risk register is the document consulted before
// raising the browser floor or adding a modern web API, and its Where column is
// the whole reason to trust it: "this API is used here, and this is the guard".
// That column used to cite `file.ext:NNN`. A bare line pin has no redundancy —
// nothing reads it, nothing fails when the file moves — so all ~19 of them
// rotted at once, and three drifted so far that the cited file no longer
// contained the API at all (issue: the tiled-renderer work moved the code out
// from under them). A reader who followed one landed somewhere the API does not
// appear and could not tell whether the row was stale or the guard was dropped.
//
// So the column now cites `path` → `needle`: a file under web/src/ plus a
// literal string that must appear in it — a symbol, selector, or call site that
// survives a refactor. This is the mechanical guard on that agreement, in the
// spirit of web/src/app.html.test.ts: delete the guard, rename the symbol, or
// move the API to another module and this fails, naming the row.
const repoRoot = join(import.meta.dirname, '..', '..');
const registerDoc = join(repoRoot, 'docs', 'COMPATIBILITY.md');
const sourceRoot = join(repoRoot, 'web', 'src');

const HEADING = '## API risk register';

// Only the Where column is an anchor surface. API/feature, Baseline, Guarded?
// and Behavior columns quote CSS properties and JS expressions as prose, and a
// needle there would have nothing to be checked against.
const WHERE_COLUMN = 1;

// A code span naming a file this repo ships: a path into web/src/ (or one of
// the two roots that sit directly in it). Anchored end to end so a needle that
// merely mentions a filename can't be mistaken for a path.
const SOURCE_PATH = /^[A-Za-z0-9_.+\-/]+\.(?:ts|svelte|css|html)$/;

// `path` → `needle`. The arrow is only an anchor when a source path sits on its
// left, which keeps it clear of the column's ordinary prose arrows
// (".ai-stage height → --stage-h").
const ANCHOR = /`([^`]+)`\s*→\s*`([^`]+)`/g;
const CODE_SPAN = /`([^`]+)`/g;

// What the column used to be, and must never silently become again.
const LINE_PIN = /`[^`]*\.(?:ts|svelte|css|html)[^`]*:\d/;

function registerRows(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(HEADING));
  if (start < 0) throw new Error(`${HEADING} not found in docs/COMPATIBILITY.md`);
  const after = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const end = after < 0 ? lines.length : after;

  return lines
    .slice(start, end)
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > WHERE_COLUMN)
    .filter((cells) => !/^-+$/.test(cells[0]))
    .filter((cells) => cells[0] !== 'API / feature');
}

export function anchorsIn(cell) {
  return [...cell.matchAll(ANCHOR)]
    .filter(([, path]) => SOURCE_PATH.test(path))
    .map(([, path, needle]) => ({ path, needle }));
}

// Every source path in the column must carry a needle. A path on its own would
// re-open the exact hole this test closes: the file still exists, so nothing
// fails, while the API it was cited for has moved elsewhere.
export function unanchoredPaths(cell) {
  const anchored = new Set(anchorsIn(cell).flatMap(({ path, needle }) => [path, needle]));
  return [...cell.matchAll(CODE_SPAN)]
    .map(([, span]) => span)
    .filter((span) => SOURCE_PATH.test(span) && !anchored.has(span));
}

const rows = registerRows(readFileSync(registerDoc, 'utf8'));
const sources = new Map();

function sourceText(path) {
  if (!sources.has(path)) {
    const file = join(sourceRoot, path);
    const readable = existsSync(file) && statSync(file).isFile();
    sources.set(path, readable ? readFileSync(file, 'utf8') : null);
  }
  return sources.get(path);
}

describe('COMPATIBILITY.md API risk register', () => {
  it('finds the register table', () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  // Self-check: a parser that silently matched nothing would let every row
  // below pass by having no anchors to check.
  it('resolves anchors out of the Where column', () => {
    const anchors = rows.flatMap((cells) => anchorsIn(cells[WHERE_COLUMN]));

    expect(anchors.length).toBeGreaterThan(30);
  });

  it('reads a path → needle pair as an anchor and ordinary prose as prose', () => {
    expect(anchorsIn('`lib/idle.ts` → `requestIdleCallback`')).toEqual([
      { path: 'lib/idle.ts', needle: 'requestIdleCallback' },
    ]);
    expect(anchorsIn('`.ai-stage` height → `--stage-h` for the fall distance')).toEqual([]);
    expect(anchorsIn('avoid — no current usage')).toEqual([]);
  });

  it('reports a source path left without a needle', () => {
    expect(unanchoredPaths('`lib/idle.ts` → `requestIdleCallback`')).toEqual([]);
    expect(unanchoredPaths('`lib/idle.ts` and `app.css`')).toEqual(['lib/idle.ts', 'app.css']);
  });

  for (const cells of rows) {
    const api = cells[0];
    const where = cells[WHERE_COLUMN];

    it(`${api} cites live code`, () => {
      expect(where).not.toMatch(LINE_PIN);
      expect(unanchoredPaths(where)).toEqual([]);

      for (const { path, needle } of anchorsIn(where)) {
        const text = sourceText(path);

        expect(text, `web/src/${path} does not exist`).not.toBeNull();
        expect(
          text.includes(needle),
          `web/src/${path} no longer contains ${JSON.stringify(needle)}`
        ).toBe(true);
      }
    });
  }
});
