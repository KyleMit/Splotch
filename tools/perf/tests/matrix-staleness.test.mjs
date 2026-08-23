import { describe, expect, it } from 'vitest';
import { assessManifest, capturedCommits, modeProvenance } from '../check-matrix-staleness.mjs';

const target = (id, modes) => ({ id, modes });
const captured = (commit) => ({ drawing: { pen: ['a.json'] }, drawingProductCommit: commit });
const preserved = (commit) => ({ drawing: 'preserved', drawingProductCommit: commit });

// Digest per commit; 'HEAD_TREE' is the branch's current tree.
const trees = (byCommit) => (commit) => byCommit[commit] ?? null;

describe('modeProvenance', () => {
  // A preserved cell is already labelled historical evidence carried forward, so
  // being behind is what it says. Gating on it would make this permanently red.
  it('ignores a preserved drawing capture', () => {
    expect(modeProvenance(preserved('old'))).toEqual([]);
  });

  // Checking only drawing let undo and action captures go stale unnoticed.
  it('covers undo and action provenance, not only drawing', () => {
    const mode = {
      drawing: { pen: ['a.json'] },
      drawingProductCommit: 'aaa',
      undoSource: 'a.json',
      undoProductCommit: 'bbb',
      actionSources: [{ source: 'x', productCommit: 'ccc' }],
    };

    expect(modeProvenance(mode).sort()).toEqual(['aaa', 'bbb', 'ccc']);
  });
});

describe('capturedCommits', () => {
  it('reports every distinct capture commit a target carries', () => {
    expect(
      capturedCommits(target('t', [captured('aaa'), captured('bbb'), preserved('old')]))
    ).toEqual(['aaa', 'bbb']);
  });
});

describe('assessManifest', () => {
  // The regression this covers: gating on commits under web/src/lib/drawing
  // reported "current" across a commit that changed DrawingCanvas.svelte and the
  // drawing-audio scheduling — both on the measured interaction path, neither in
  // that directory. A tree digest cannot miss a file nobody thought of.
  it('calls a capture stale when the measured tree changed outside the engine', () => {
    const manifest = { targets: [target('ipad-device-web', [captured('410371ea')])] };

    const [row] = assessManifest(manifest, {
      treeAt: trees({ '410371ea': 'oldtree', HEAD_TREE: 'newtree' }),
      commitsSince: () => 0,
    });

    expect(row.verdict).toBe('STALE');
    expect(row['engine commits since']).toBe(0);
  });

  it('calls a capture current when the measured tree is unchanged', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, {
      treeAt: trees({ abc: 'sametree', HEAD_TREE: 'sametree' }),
      commitsSince: () => 0,
    });

    expect(row.verdict).toBe('current');
  });

  // "No error" must never read as "fine". A shallow clone makes every lookup fail,
  // and reporting the matrix current there is the failure shape this exists to end.
  it('reports an unreachable commit as UNVERIFIABLE, not current', () => {
    const manifest = { targets: [target('mac-chrome', [captured('gone')])] };

    const [row] = assessManifest(manifest, {
      treeAt: trees({ HEAD_TREE: 'newtree' }),
      commitsSince: () => undefined,
    });

    expect(row.verdict).toBe('UNVERIFIABLE');
  });

  it('reports nothing when every target is preserved', () => {
    const manifest = { targets: [target('android-device-web', [preserved('old')])] };

    expect(assessManifest(manifest, { treeAt: trees({}), commitsSince: () => 0 })).toEqual([]);
  });
});
