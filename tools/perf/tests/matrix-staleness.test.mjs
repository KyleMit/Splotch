import { describe, expect, it } from 'vitest';
import {
  MEASURED_SURFACE,
  assessManifest,
  capturedCommits,
  modeProvenance,
  everyChangeIsASpec,
} from '../check-matrix-staleness.mjs';

const target = (id, modes) => ({ id, modes });
const captured = (commit) => ({ drawing: { pen: ['a.json'] }, drawingProductCommit: commit });
const preserved = (commit) => ({ drawing: 'preserved', drawingProductCommit: commit });
const capturedUntracked = (commit) => ({
  drawing: 'captured-untracked',
  drawingProductCommit: commit,
  undoSource: 'captured-untracked',
  actionSources: 'captured-untracked',
});

// Surface fingerprint per commit; 'HEAD' is the branch's current surface.
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

  it('checks captured-untracked sections because they still claim currency', () => {
    expect(modeProvenance(capturedUntracked('current'))).toEqual(['current']);
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
      surfaceAt: trees({ '410371ea': 'oldtree', HEAD: 'newtree' }),
      commitsSince: () => 0,
    });

    expect(row.verdict).toBe('STALE');
    expect(row['engine commits since']).toBe(0);
  });

  it('calls a capture current when the measured tree is unchanged', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, {
      surfaceAt: trees({ abc: 'sametree', HEAD: 'sametree' }),
      commitsSince: () => 0,
    });

    expect(row.verdict).toBe('current');
  });

  // "No error" must never read as "fine". A shallow clone makes every lookup fail,
  // and reporting the matrix current there is the failure shape this exists to end.
  it('reports an unreachable commit as UNVERIFIABLE, not current', () => {
    const manifest = { targets: [target('mac-chrome', [captured('gone')])] };

    const [row] = assessManifest(manifest, {
      surfaceAt: trees({ HEAD: 'newtree' }),
      commitsSince: () => undefined,
    });

    expect(row.verdict).toBe('UNVERIFIABLE');
  });

  it('reports nothing when every target is preserved', () => {
    const manifest = { targets: [target('android-device-web', [preserved('old')])] };

    expect(assessManifest(manifest, { surfaceAt: trees({}), commitsSince: () => 0 })).toEqual([]);
  });
});

describe('the measured surface', () => {
  // The regression this covers: gating on the `web/src` tree alone reported
  // "current" across 105c23bd..a347da5e, whose `web/src` trees are byte-identical
  // and which changes three pencil sound assets a drawing capture plays.
  it('includes the static assets a capture exercises', () => {
    expect(MEASURED_SURFACE).toContain('web/static');
    expect(MEASURED_SURFACE).toContain('web/src');
  });

  // Both absences are deliberate: a check that fires on changes which cannot move
  // a frame is one people learn to ignore.
  it('excludes specs and package.json, which move without changing the product', () => {
    expect(MEASURED_SURFACE).not.toContain('web/tests');
    expect(MEASURED_SURFACE).not.toContain('package.json');
    expect(MEASURED_SURFACE).toContain('pnpm-lock.yaml');
  });

  it('calls a capture stale when only a static asset moved', () => {
    const manifest = { targets: [target('ipad-device-web', [captured('105c23bd')])] };

    const [row] = assessManifest(manifest, {
      surfaceAt: trees({
        '105c23bd': 'web/src=same web/static=old',
        HEAD: 'web/src=same web/static=new',
      }),
      commitsSince: () => 0,
    });

    expect(row.verdict).toBe('STALE');
    expect(row['engine commits since']).toBe(0);
  });
});

// A comment inside web/src/lib/icons/tokenFallback.test.ts was, on 2026-08-23,
// the entire difference between five matrix targets and the current tree. It
// marked 100 cells stale and exited the generator 1 on every regeneration from
// then on — a checker nobody can act on is a checker nobody reads.
describe('a spec is not the product', () => {
  it('recognises a change set that is only specs', () => {
    expect(everyChangeIsASpec(['web/src/lib/icons/tokenFallback.test.ts'])).toBe(true);
    expect(everyChangeIsASpec(['web/src/a.test.ts', 'web/src/b.spec.ts'])).toBe(true);
  });

  // The dangerous direction. A commit touching a spec AND a source file must not
  // be waved through on the strength of the spec.
  it('refuses a change set that also touches shipping source', () => {
    expect(everyChangeIsASpec(['web/src/a.test.ts', 'web/src/lib/drawing/engine.ts'])).toBe(false);
    expect(everyChangeIsASpec(['web/src/lib/drawing/engine.ts'])).toBe(false);
  });

  // An empty list means the differing files could not be read, not that nothing
  // differs — the tree hashes already said otherwise. Answering "all specs" there
  // would clear a target on missing evidence.
  it('answers false when there is nothing to judge', () => {
    expect(everyChangeIsASpec([])).toBe(false);
  });

  it('keeps a target current when only its specs moved, and says so', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, {
      surfaceAt: trees({ abc: 'oldtree', HEAD: 'newtree' }),
      commitsSince: () => 0,
      changedFilesSince: () => ['web/src/lib/icons/tokenFallback.test.ts'],
    });

    expect(row.verdict).toBe('current (specs only)');
  });

  it('still calls a target stale when a source file moved with the spec', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, {
      surfaceAt: trees({ abc: 'oldtree', HEAD: 'newtree' }),
      commitsSince: () => 0,
      changedFilesSince: () => ['web/src/a.test.ts', 'web/src/lib/drawing/engine.ts'],
    });

    expect(row.verdict).toBe('STALE');
  });
});
