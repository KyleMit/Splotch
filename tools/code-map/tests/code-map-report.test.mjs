import { describe, expect, it } from 'vitest';

import {
  assignFiles,
  renderAssignmentsTsv,
  renderBlocks,
  spliceBlocks,
  summarize,
} from '../lib/code-map-report.mjs';

const LINES = new Map([
  ['src/lib/drawing/engine.ts', 400],
  ['src/lib/drawing/engine.test.ts', 200],
  ['src/lib/audio/drawingSound.ts', 90],
  ['docs/adrs/0001-one-codebase.md', 50],
]);
const PATHS = [...LINES.keys(), 'assets/static/favicon.ico', 'src/CLAUDE.md'];
const COMMIT = { sha: 'a'.repeat(40), date: '2026-09-25' };

describe('summarize', () => {
  const summary = summarize(assignFiles(PATHS), LINES);

  it('totals measured lines and files and counts each exclusion class', () => {
    expect(summary).toMatchObject({
      trackedFiles: 6,
      measuredFiles: 4,
      measuredLoc: 740,
      excludedFiles: 2,
      exclusionCounts: [
        { label: 'Binary media / archives', files: 1 },
        { label: 'Generated / provider agent delivery trees', files: 1 },
      ],
    });
  });

  it('orders areas and src domains by lines, largest first', () => {
    expect(summary.areas.map((area) => [area.key, area.loc])).toEqual([
      ['src', 690],
      ['docs', 50],
    ]);
    expect(summary.areas[0].buckets.map((bucket) => bucket.label)).toEqual([
      'Drawing / canvas engine',
      'Audio',
    ]);
  });
});

describe('spliceBlocks', () => {
  const blocks = renderBlocks(summarize(assignFiles(PATHS), LINES), COMMIT);
  const markers = (name) =>
    `<!-- code-map:generated:start ${name} -->\nstale\n<!-- code-map:generated:end ${name} -->`;
  const document = [
    '# Map',
    markers('snapshot'),
    'prose',
    markers('coverage'),
    markers('totals'),
    markers('splits'),
    'notes',
  ].join('\n\n');

  it('rewrites only the marked blocks and keeps the prose between them', () => {
    const spliced = spliceBlocks(document, blocks);
    expect(spliced).not.toContain('stale');
    expect(spliced).toContain('prose');
    expect(spliced).toContain('notes');
    expect(spliced).toContain('Snapshot of aaaaaaaaaaaa (2026-09-25)');
    expect(spliced).toContain('## Grand total: **740 LOC across 4 measured files**');
  });

  it('is idempotent', () => {
    const once = spliceBlocks(document, blocks);
    expect(spliceBlocks(once, blocks)).toBe(once);
  });

  it('fails loudly when a block marker is missing', () => {
    expect(() => spliceBlocks('# Map', blocks)).toThrow(/"snapshot" block markers/);
  });
});

describe('renderAssignmentsTsv', () => {
  it('lists each path with its placement and the src rule that chose it', () => {
    const rows = renderAssignmentsTsv(assignFiles(PATHS), LINES).split('\n');
    expect(rows[0]).toBe('path\tarea\tbucket\tsubdomain\tlines\tsrc rule');
    expect(rows).toContain('assets/static/favicon.ico\texcluded\tBinary media / archives\t\t\t');
    expect(rows.find((row) => row.startsWith('src/lib/drawing/engine.ts\t'))).toBe(
      'src/lib/drawing/engine.ts\tsrc\tDrawing / canvas engine\t' +
        'Shared drawing geometry & retained primitives\t400\t/^lib\\/drawing\\//'
    );
  });
});
