import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The sheet embeds every layer as a data URI, and a browser decodes one by its
// declared type alone. The client treats a failed decode as a missing asset, so
// mislabelled SVG line art once left every tile without its pen and chalk while
// the build still succeeded. This builds a real sheet and reads each payload's
// bytes against the type it declares.
const GENERATOR = join(import.meta.dirname, '..', 'coloring', 'gen-book-proof-sheet.mjs');
const SHEET_DATA_START = 'window.__COLORING_BOOK_PROOF_SHEET__ = ';
const SHEET_DATA_END = ';</script>';
const LAYERS = ['night', 'lineArt', 'chalk', 'light'];
const TYPE_BY_FORMAT = { svg: 'image/svg+xml', webp: 'image/webp' };

let outDir;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'splotch-book-proof-sheet-'));
});
afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function buildSheetData(sourceArgs) {
  const out = join(outDir, 'sheet.html');
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', GENERATOR, 'nature/ant-wide', ...sourceArgs, '--out', out],
    { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }
  );
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const html = readFileSync(out, 'utf8');
  const start = html.indexOf(SHEET_DATA_START);
  expect(start).toBeGreaterThan(-1);
  const dataStart = start + SHEET_DATA_START.length;
  return JSON.parse(html.slice(dataStart, html.indexOf(SHEET_DATA_END, dataStart)));
}

// The format a browser finds when it decodes the payload, read from its bytes.
function payloadFormat(uri) {
  const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  if (bytes.toString('utf8', 0, 4) === '<svg') return 'svg';
  const riff = bytes.toString('latin1', 0, 4) === 'RIFF';
  if (riff && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return 'unknown';
}

function declaredType(uri) {
  return /^data:([^;,]+);base64,/.exec(uri)?.[1] ?? 'none';
}

describe.each([
  ['the working tree', [], 1],
  ['git:HEAD beside the working tree', ['--source', 'git:HEAD'], 2],
])('the book proof sheet built from %s', (_, sourceArgs, cellCount) => {
  it('embeds canonical SVG line art and labels every payload by its real format', () => {
    const { cells } = buildSheetData(sourceArgs);

    expect(cells).toHaveLength(cellCount);
    for (const cell of cells) {
      expect(cell.lineArt).toEqual(expect.any(String));
      expect(cell.chalk).toEqual(expect.any(String));
      expect([cell.lineArtKind, cell.chalkKind]).toEqual(['vector', 'vector']);
    }
    const labels = cells.flatMap((cell) =>
      LAYERS.filter((layer) => cell[layer]).map((layer) => {
        const uri = cell[layer];
        const format = payloadFormat(uri);
        return { layer, format, declared: declaredType(uri), expected: TYPE_BY_FORMAT[format] };
      })
    );
    expect(labels.map(({ layer, format }) => `${layer}:${format}`)).toEqual(
      cells.flatMap(() => ['night:webp', 'lineArt:svg', 'chalk:svg', 'light:webp'])
    );
    expect(labels.filter(({ declared, expected }) => declared !== expected)).toEqual([]);
  });
});
