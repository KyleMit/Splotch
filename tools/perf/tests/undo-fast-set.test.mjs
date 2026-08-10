import { describe, expect, it } from 'vitest';

import {
  appendFullRun,
  deriveIdealFastSet,
  evaluateFastSet,
  soleExercisers,
  validateFastSetHistory,
} from '../undo-fast-set.mjs';
import {
  ALL_UNDO_SCENARIO_KEYS,
  FAST_UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_PATHS,
} from '../undo-scenario-keys.mjs';

const result = (key, commitP95Ms) => ({ key, draw: { commitP95Ms } });
const emptyHistory = () => ({ schemaVersion: 1, runs: [] });

describe('undo fast-set coverage', () => {
  it('covers every path with exactly one exerciser', () => {
    const uncovered = soleExercisers().filter(
      ({ scenarioKey }) => !FAST_UNDO_SCENARIO_KEYS.includes(scenarioKey)
    );

    expect(uncovered).toEqual([]);
    expect(soleExercisers()).toEqual([
      { path: 'multi-pointer', scenarioKey: 'multi-finger' },
      { path: 'cold-encode', scenarioKey: 'multi-finger' },
      { path: 'crayon-pass-split', scenarioKey: 'crayon-scribbles' },
    ]);
  });

  it('declares paths for every registered scenario', () => {
    expect(Object.keys(UNDO_SCENARIO_PATHS)).toEqual(ALL_UNDO_SCENARIO_KEYS);
    expect(Object.values(UNDO_SCENARIO_PATHS).every((paths) => paths.length > 0)).toBe(true);
  });
});

describe('data-derived membership', () => {
  it('fills non-mandatory slots with the highest measured-to-budget ratio', () => {
    const history = {
      schemaVersion: 1,
      runs: [
        {
          scenarios: [
            { key: 'mandatory', headroomRatio: 0.5, breached: false },
            { key: 'variable', headroomRatio: 0.75, breached: false },
            { key: 'steady', headroomRatio: 0.5, breached: false },
          ],
        },
        {
          scenarios: [
            { key: 'mandatory', headroomRatio: 0.5, breached: false },
            { key: 'variable', headroomRatio: 0.05, breached: false },
            { key: 'steady', headroomRatio: 0.5, breached: false },
          ],
        },
      ],
    };

    expect(
      deriveIdealFastSet({
        history,
        scenarioKeys: ['mandatory', 'variable', 'steady'],
        scenarioPaths: {
          mandatory: ['sole'],
          variable: ['shared'],
          steady: ['shared'],
        },
        fastSetSize: 2,
      }).ideal
    ).toEqual(['mandatory', 'variable']);
  });

  it('replaces a stale member when a non-member was recently near budget', () => {
    const history = {
      schemaVersion: 1,
      runs: Array.from({ length: 3 }, () => ({
        scenarios: [
          { key: 'mandatory', headroomRatio: 0.5, breached: false },
          { key: 'stale', headroomRatio: 0.1, breached: false },
          { key: 'recent', headroomRatio: 0.9, breached: false },
        ],
      })),
    };

    expect(
      deriveIdealFastSet({
        history,
        scenarioKeys: ['mandatory', 'stale', 'recent'],
        scenarioPaths: {
          mandatory: ['sole'],
          stale: ['shared'],
          recent: ['shared'],
        },
        fastSetSize: 2,
      }).ideal
    ).toEqual(['mandatory', 'recent']);
  });
});

describe('full-run miss history', () => {
  const healthyResults = () => ALL_UNDO_SCENARIO_KEYS.map((key) => result(key, 1));

  it('derives a full-only breach streak from the run records', () => {
    const missedResults = healthyResults().map((scenario) =>
      scenario.key === 'short-marks' ? result(scenario.key, 26) : scenario
    );
    const once = appendFullRun({
      history: emptyHistory(),
      results: missedResults,
      startedAt: '2026-08-01T00:00:00.000Z',
      budgetMs: 25,
    });
    const twice = appendFullRun({
      history: once,
      results: missedResults,
      startedAt: '2026-08-02T00:00:00.000Z',
      budgetMs: 25,
    });

    expect(twice.runs.at(-1)).toMatchObject({
      breaches: ['short-marks'],
      fastSetBreaches: [],
      fullOnlyBreaches: ['short-marks'],
      fastSetWouldCatch: false,
      fastSetMiss: true,
    });
    expect(evaluateFastSet(twice).consecutiveMisses).toBe(2);
  });

  it('records a breach as caught when a fast scenario also breaches', () => {
    const results = healthyResults().map((scenario) =>
      ['short-marks', 'multi-finger'].includes(scenario.key) ? result(scenario.key, 26) : scenario
    );
    const history = appendFullRun({
      history: emptyHistory(),
      results,
      startedAt: '2026-08-01T00:00:00.000Z',
      budgetMs: 25,
    });

    expect(history.runs[0]).toMatchObject({
      fastSetBreaches: ['multi-finger'],
      fullOnlyBreaches: ['short-marks'],
      fastSetWouldCatch: true,
      fastSetMiss: false,
    });
    expect(evaluateFastSet(history).consecutiveMisses).toBe(0);
  });

  it('rejects history that cannot support a full-set comparison', () => {
    expect(() =>
      validateFastSetHistory({
        schemaVersion: 1,
        runs: [
          {
            startedAt: '2026-08-01T00:00:00.000Z',
            budgetMs: 25,
            scenarios: [],
            fastSetMiss: false,
          },
        ],
      })
    ).toThrow('does not contain every scenario');
  });

  it('accepts one-ULP ratio differences at large magnitudes', () => {
    const history = appendFullRun({
      history: emptyHistory(),
      results: ALL_UNDO_SCENARIO_KEYS.map((key) => result(key, 10 ** 16)),
      startedAt: '2026-08-01T00:00:00.000Z',
      budgetMs: 1,
    });
    history.runs[0].scenarios[0].headroomRatio += 2;

    expect(validateFastSetHistory(history)).toBe(history);
  });
});
