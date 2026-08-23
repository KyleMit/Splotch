import { describe, expect, it } from 'vitest';
import { assessManifest, capturedCommits, ENGINE_PATH } from '../check-matrix-staleness.mjs';

const target = (id, modes) => ({ id, modes });
const captured = (commit) => ({
  drawing: { pen: ['a.json'] },
  drawingProductCommit: commit,
});
const preserved = (commit) => ({ drawing: 'preserved', drawingProductCommit: commit });

// Every commit is "behind" by however many the fixture says, keyed by path.
const counter = (byPath) => (_commit, path) => byPath[path] ?? 0;

describe('capturedCommits', () => {
  // A preserved cell is already labelled historical evidence carried forward, so
  // being behind is what it says it is. Gating on it would make this check
  // permanently red and train everyone to ignore it.
  it('ignores preserved modes and reports only cells claiming currency', () => {
    const t = target('ipad-device-web', [captured('aaa'), preserved('old'), captured('aaa')]);

    expect(capturedCommits(t)).toEqual(['aaa']);
  });

  it('reports every distinct capture commit a target carries', () => {
    const t = target('ipad-device-native', [captured('aaa'), captured('bbb')]);

    expect(capturedCommits(t)).toEqual(['aaa', 'bbb']);
  });

  it('reports nothing for a fully preserved target', () => {
    expect(capturedCommits(target('android-device-web', [preserved('old')]))).toEqual([]);
  });
});

describe('assessManifest', () => {
  it('calls a capture stale once the engine has moved under it', () => {
    const manifest = { targets: [target('ipad-device-web', [captured('ae674d71')])] };

    const [row] = assessManifest(manifest, counter({ [ENGINE_PATH]: 4, 'web/src': 9 }));

    expect(row.verdict).toBe('STALE');
    expect(row[`${ENGINE_PATH} commits since`]).toBe(4);
  });

  // Gating on all of web/src would flag a capture because /admin changed, which
  // cannot move a drawing frame.
  it('does not call a capture stale for app changes outside the engine', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, counter({ [ENGINE_PATH]: 0, 'web/src': 12 }));

    expect(row.verdict).toBe('current');
    expect(row['web/src commits since']).toBe(12);
  });

  it('reports nothing when every target is preserved', () => {
    const manifest = { targets: [target('android-device-web', [preserved('old')])] };

    expect(assessManifest(manifest, counter({}))).toEqual([]);
  });
});

describe('an unreachable capture commit', () => {
  // "No error" must never read as "fine". A shallow clone makes every rev-list
  // fail, and a zero there would report the whole matrix current.
  it('is UNVERIFIABLE rather than current', () => {
    const manifest = { targets: [target('mac-chrome', [captured('abc')])] };

    const [row] = assessManifest(manifest, () => Number.NaN);

    expect(row.verdict).toBe('UNVERIFIABLE');
  });
});
