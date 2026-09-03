import { describe, expect, it } from 'vitest';
import {
  comparableFingerprints,
  formatGateFailures,
  GATE_COMPARISON_UNKNOWN,
  gateFailureFingerprint,
  parseGateFailures,
  reproducedGateFailures,
} from '../lib/undo-gate-failures.mjs';

const summary = ({ scenarios = [], breaches = [], evaluated } = {}) => ({
  scenarios,
  gate: { breaches, ...(evaluated === undefined ? {} : { evaluated }) },
});

describe('gate failure fingerprint', () => {
  it('is empty for a run that passed', () => {
    expect(gateFailureFingerprint(summary({ scenarios: [{ key: 'multi-finger' }] }))).toEqual([]);
  });

  it('names the breaching scenario', () => {
    expect(gateFailureFingerprint(summary({ breaches: ['multi-finger'] }))).toEqual([
      'multi-finger:breach',
    ]);
  });

  it('names a scenario that never produced a measurement', () => {
    const skipped = [{ key: 'crayon-scribbles', skipped: true, error: 'history never settled' }];
    expect(gateFailureFingerprint(summary({ scenarios: skipped }))).toEqual([
      'crayon-scribbles:incomplete',
    ]);
  });

  it('records a whole-run failure that blames no single scenario', () => {
    // The marks-less bundle: nothing is skipped and nothing breached, but the
    // gate refused to certify. Without an entry for it the retry would read an
    // empty fingerprint and fall back instead of reproducing it.
    expect(gateFailureFingerprint(summary({ evaluated: false }))).toEqual([
      'run:no-commit-samples',
    ]);
  });

  it('does not blame the run when a scenario is already blamed', () => {
    const scenarios = [{ key: 'crayon-scribbles', skipped: true }];
    expect(gateFailureFingerprint(summary({ scenarios, evaluated: false }))).toEqual([
      'crayon-scribbles:incomplete',
    ]);
  });

  it('is empty rather than throwing for an artifact with no gate block', () => {
    expect(gateFailureFingerprint({})).toEqual([]);
    expect(gateFailureFingerprint(null)).toEqual([]);
  });
});

describe('reproduction across runners', () => {
  // The 2026-09-02 post-merge run on main, from both runners' uploaded
  // artifacts. The first runner skipped crayon-scribbles on a settle timeout
  // and measured multi-finger clean at a 7 ms p95; the fresh-runner retry
  // completed crayon-scribbles and breached multi-finger at 200 ms. Two
  // failures with nothing in common — and the outcome-only comparison this
  // replaces read them as a reproduced breach and filed against main.
  const firstRunner = ['crayon-scribbles:incomplete'];
  const retryRunner = ['multi-finger:breach'];

  it('reproduces nothing when the two runners failed at different things', () => {
    expect(reproducedGateFailures(firstRunner, retryRunner)).toEqual([]);
  });

  it('reproduces the overlap when they failed at the same thing', () => {
    expect(reproducedGateFailures(['multi-finger:breach'], retryRunner)).toEqual([
      'multi-finger:breach',
    ]);
  });

  it('reproduces only the shared subset of a multi-failure pair', () => {
    const first = ['crayon-scribbles:incomplete', 'multi-finger:breach'];
    const second = ['crayon-scribbles:breach', 'multi-finger:breach'];
    expect(reproducedGateFailures(first, second)).toEqual(['multi-finger:breach']);
  });

  // A deliberate false negative, pinned so it cannot change silently. The same
  // expensive stroke-end work could plausibly blow the budget on a fast host and
  // keep history from settling on a slow one, and this suppresses that pair even
  // though both runners implicate the same scenario. Matching on scope alone is
  // not the fix: `incomplete` collapses a settle timeout, a navigation failure
  // and every other scenario exception into one token, so scope-only agreement
  // would pair a real breach with an unrelated harness fault. Closing it needs
  // `incomplete` split into subcauses with a declared compatibility rule —
  // ADR-0158 records why that waits for evidence.
  it('does not treat the same scenario failing differently as a reproduction', () => {
    expect(
      reproducedGateFailures(['crayon-scribbles:incomplete'], ['crayon-scribbles:breach'])
    ).toEqual([]);
  });

  it('refuses to compare when either side left no fingerprint', () => {
    // Fail closed: an unreadable pair must not read as an acquittal, so the
    // caller is told the comparison could not be made.
    expect(comparableFingerprints([], retryRunner)).toBe(false);
    expect(comparableFingerprints(firstRunner, [])).toBe(false);
    expect(comparableFingerprints(firstRunner, retryRunner)).toBe(true);
    expect(GATE_COMPARISON_UNKNOWN).not.toBe('');
  });
});

describe('fingerprint wire format', () => {
  it('round-trips through the single line a job output carries', () => {
    const failures = ['crayon-scribbles:incomplete', 'multi-finger:breach'];
    expect(parseGateFailures(formatGateFailures(failures))).toEqual(failures);
  });

  it('reads an empty or whitespace-only job output as no failures', () => {
    expect(parseGateFailures('')).toEqual([]);
    expect(parseGateFailures(undefined)).toEqual([]);
    expect(parseGateFailures(' , ')).toEqual([]);
  });
});
