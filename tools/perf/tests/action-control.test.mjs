import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { withActionControlScoreability } from '../gen-performance-matrix.mjs';

const MATRIX = join(ROOT, 'scrapbook', 'performance', '2026-07-31-deployment-target-matrix');
const published = JSON.parse(readFileSync(join(MATRIX, 'data.json'), 'utf8'));
const report = readFileSync(join(MATRIX, 'index.html'), 'utf8');

function modesOf(targetId) {
  return published.targets.find((target) => target.id === targetId).modes;
}

function action(label, passed) {
  return {
    label,
    passed,
    firstFrame: { p95: 1 },
    postActionFrames: { p95: 1, max: 1 },
  };
}

describe('withActionControlScoreability', () => {
  it('marks a section unscoreable when the control failed its own gate', () => {
    const section = withActionControlScoreability({
      results: [action('idle frame control', false), action('expand action drawer', false)],
    });

    expect(section).toMatchObject({ scoreable: false, controlLabel: 'idle frame control' });
  });

  it('leaves a section scoreable when the control held', () => {
    const section = withActionControlScoreability({
      results: [action('idle frame control', true), action('expand action drawer', false)],
    });

    expect(section).toMatchObject({ scoreable: true, controlLabel: 'idle frame control' });
  });

  // A target that never ran a control sweep is not proven bad. It scores, because
  // that is how it has always been read; what changes is that a FAILING control is
  // now believed rather than dropped.
  it('scores a section that carries no control row', () => {
    const section = withActionControlScoreability({ results: [action('open settings', true)] });

    expect(section).toMatchObject({ scoreable: true, controlLabel: null });
  });

  it('passes a missing section through untouched', () => {
    expect(withActionControlScoreability(null)).toBeNull();
    expect(withActionControlScoreability({ noResults: true })).toEqual({ noResults: true });
  });
});

// The published matrix is the thing the issue is about, so it is asserted directly
// rather than through a synthetic manifest.
describe('the published android-emulator-web rows', () => {
  const modes = modesOf('android-emulator-web');

  it('marks exactly the two portrait modes unscoreable', () => {
    const byId = Object.fromEntries(modes.map((mode) => [mode.id, mode.actions?.scoreable]));

    expect(byId).toEqual({
      'portrait-light': false,
      'portrait-dark': false,
      'landscape-light': true,
      'landscape-dark': true,
    });
  });

  // Those two modes report the worst action coverage in the matrix, and it is not a
  // reading of the product: the do-nothing baseline is itself over the gate.
  it('keeps their action results published rather than deleting them', () => {
    for (const mode of modes.filter((candidate) => candidate.actions?.scoreable === false)) {
      expect(mode.actions.results.length).toBeGreaterThan(0);
      expect(mode.actions.results.some((result) => result.label === 'idle frame control')).toBe(
        true
      );
    }
  });
});

describe('the rendered report', () => {
  it('marks an unattributable cell rather than colouring it by ratio', () => {
    expect(report).toContain('heat-cell unscoreable');
    expect(report).toContain('this mode’s idle frame control failed its own gate');
    expect(report).toContain('>no control<');
  });

  // The denominator is the tell. Counting a mode whose control failed is how "the
  // worst cases cluster on the Android emulator" became a reading of the product.
  it('leaves unscoreable modes out of the cross-mode failure ranking', () => {
    const denominators = [...report.matchAll(/(\d+) of (\d+) modes failed/g)].map((match) =>
      Number(match[2])
    );

    expect(denominators.length).toBeGreaterThan(0);
    expect(denominators).not.toContain(40);
    expect(denominators).toContain(38);
  });
});
