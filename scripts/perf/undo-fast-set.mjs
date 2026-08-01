import { readFileSync } from 'node:fs';

import {
  ALL_UNDO_SCENARIO_KEYS,
  FAST_UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_PATHS,
} from './undo-scenario-keys.mjs';

const FAST_SET_HISTORY_SCHEMA_VERSION = 1;
const FAST_SET_HISTORY_WINDOW_RUNS = 3;
const FAST_SET_NEAR_BUDGET_RATIO = 0.8;
const FAST_SET_HISTORY_RETAINED_RUNS = 50;

const sameMembers = (left, right) =>
  left.length === right.length && left.every((key) => right.includes(key));

export function soleExercisers(scenarioPaths = UNDO_SCENARIO_PATHS) {
  const exercisersByPath = new Map();
  for (const [scenarioKey, paths] of Object.entries(scenarioPaths)) {
    for (const path of paths) {
      const exercisers = exercisersByPath.get(path) ?? [];
      exercisers.push(scenarioKey);
      exercisersByPath.set(path, exercisers);
    }
  }
  return [...exercisersByPath.entries()]
    .filter(([, exercisers]) => exercisers.length === 1)
    .map(([path, [scenarioKey]]) => ({ path, scenarioKey }));
}

function scenarioStats(historyWindow, scenarioKeys) {
  return new Map(
    scenarioKeys.map((key) => {
      const samples = historyWindow
        .map((run) => run.scenarios.find((scenario) => scenario.key === key))
        .filter(Boolean);
      const ratios = samples.map((sample) => sample.headroomRatio);
      return [
        key,
        {
          lowestHeadroomRatio: ratios.length > 0 ? Math.min(...ratios) : Number.POSITIVE_INFINITY,
          nearBudget: ratios.some((ratio) => ratio >= FAST_SET_NEAR_BUDGET_RATIO),
          breached: samples.some((sample) => sample.breached),
        },
      ];
    })
  );
}

const compareHeadroom = (stats) => (left, right) => {
  const difference = stats.get(left).lowestHeadroomRatio - stats.get(right).lowestHeadroomRatio;
  return difference || left.localeCompare(right);
};

export function deriveIdealFastSet({
  history,
  scenarioKeys = ALL_UNDO_SCENARIO_KEYS,
  scenarioPaths = UNDO_SCENARIO_PATHS,
  fastSetSize = FAST_UNDO_SCENARIO_KEYS.length,
}) {
  const historyWindow = history.runs.slice(-FAST_SET_HISTORY_WINDOW_RUNS);
  const stats = scenarioStats(historyWindow, scenarioKeys);
  const mandatory = [
    ...new Set(soleExercisers(scenarioPaths).map(({ scenarioKey }) => scenarioKey)),
  ];
  if (mandatory.length > fastSetSize) {
    throw new Error(
      `${mandatory.length} scenarios are mandatory sole exercisers, but the fast set has ${fastSetSize} slots`
    );
  }

  const ranked = scenarioKeys
    .filter((key) => !mandatory.includes(key))
    .sort(compareHeadroom(stats));
  const ideal = [...mandatory, ...ranked.slice(0, fastSetSize - mandatory.length)];
  if (historyWindow.length < FAST_SET_HISTORY_WINDOW_RUNS) {
    return { ideal, mandatory, historyWindowRuns: historyWindow.length };
  }
  const staleMembers = ideal
    .filter((key) => !mandatory.includes(key) && !stats.get(key).nearBudget)
    .sort(compareHeadroom(stats));
  const recentChallengers = ranked
    .filter((key) => !ideal.includes(key) && stats.get(key).nearBudget)
    .sort((left, right) => {
      const breachDifference = Number(stats.get(right).breached) - Number(stats.get(left).breached);
      return breachDifference || compareHeadroom(stats)(left, right);
    });

  while (staleMembers.length > 0 && recentChallengers.length > 0) {
    const stale = staleMembers.pop();
    const challenger = recentChallengers.shift();
    ideal[ideal.indexOf(stale)] = challenger;
  }

  return { ideal, mandatory, historyWindowRuns: historyWindow.length };
}

function validateScenarioRecord(scenario, run, runIndex) {
  if (!ALL_UNDO_SCENARIO_KEYS.includes(scenario?.key)) {
    throw new Error(`fast-set history run ${runIndex} contains an unknown scenario key`);
  }
  if (!Number.isFinite(scenario.measuredMs) || !Number.isFinite(scenario.headroomRatio)) {
    throw new Error(`fast-set history run ${runIndex} has invalid timing data for ${scenario.key}`);
  }
  if (typeof scenario.breached !== 'boolean') {
    throw new Error(`fast-set history run ${runIndex} has invalid breach data for ${scenario.key}`);
  }
  const expectedRatio = scenario.measuredMs / run.budgetMs;
  if (Math.abs(scenario.headroomRatio - expectedRatio) > Number.EPSILON) {
    throw new Error(
      `fast-set history run ${runIndex} has inconsistent headroom for ${scenario.key}`
    );
  }
  if (scenario.breached !== scenario.measuredMs > run.budgetMs) {
    throw new Error(
      `fast-set history run ${runIndex} has inconsistent breach data for ${scenario.key}`
    );
  }
}

export function validateFastSetHistory(history) {
  if (history?.schemaVersion !== FAST_SET_HISTORY_SCHEMA_VERSION || !Array.isArray(history.runs)) {
    throw new Error(
      `fast-set history must use schemaVersion ${FAST_SET_HISTORY_SCHEMA_VERSION} with a runs array`
    );
  }
  history.runs.forEach((run, index) => {
    if (
      !Number.isFinite(run.budgetMs) ||
      run.budgetMs <= 0 ||
      Number.isNaN(Date.parse(run.startedAt))
    ) {
      throw new Error(`fast-set history run ${index} has invalid run metadata`);
    }
    if (!Array.isArray(run.scenarios) || run.scenarios.length !== ALL_UNDO_SCENARIO_KEYS.length) {
      throw new Error(`fast-set history run ${index} does not contain every scenario`);
    }
    run.scenarios.forEach((scenario) => validateScenarioRecord(scenario, run, index));
    if (
      new Set(run.scenarios.map((scenario) => scenario.key)).size !== ALL_UNDO_SCENARIO_KEYS.length
    ) {
      throw new Error(`fast-set history run ${index} contains duplicate scenarios`);
    }
    if (typeof run.fastSetMiss !== 'boolean') {
      throw new Error(`fast-set history run ${index} has invalid miss data`);
    }
  });
  return history;
}

export function readFastSetHistory(path) {
  return validateFastSetHistory(JSON.parse(readFileSync(path, 'utf8')));
}

function consecutiveMisses(runs) {
  let count = 0;
  for (let index = runs.length - 1; index >= 0 && runs[index].fastSetMiss; index--) count++;
  return count;
}

export function appendFullRun({ history, results, startedAt, budgetMs }) {
  const scenarios = results.map((result) => ({
    key: result.key,
    measuredMs: result.draw.commitP95Ms,
    headroomRatio: result.draw.commitP95Ms / budgetMs,
    breached: result.draw.commitP95Ms > budgetMs,
  }));
  const breaches = scenarios
    .filter((scenario) => scenario.breached)
    .map((scenario) => scenario.key);
  const fastSetBreaches = breaches.filter((key) => FAST_UNDO_SCENARIO_KEYS.includes(key));
  const fullOnlyBreaches = breaches.filter((key) => !FAST_UNDO_SCENARIO_KEYS.includes(key));
  const fastSetMiss = breaches.length > 0 && fastSetBreaches.length === 0;
  const runs = [
    ...history.runs,
    {
      startedAt,
      budgetMs,
      scenarios,
      breaches,
      fastSetBreaches,
      fullOnlyBreaches,
      fastSetWouldCatch: breaches.length === 0 ? null : !fastSetMiss,
      fastSetMiss,
    },
  ].slice(-FAST_SET_HISTORY_RETAINED_RUNS);
  const consecutiveFastSetMisses = consecutiveMisses(runs);
  runs[runs.length - 1].consecutiveFastSetMisses = consecutiveFastSetMisses;
  return { schemaVersion: FAST_SET_HISTORY_SCHEMA_VERSION, runs };
}

export function evaluateFastSet(history) {
  const derived = deriveIdealFastSet({ history });
  const latest = history.runs.at(-1);
  return {
    committed: FAST_UNDO_SCENARIO_KEYS,
    ideal: derived.ideal,
    mandatory: derived.mandatory,
    historyWindowRuns: derived.historyWindowRuns,
    drifted: !sameMembers(FAST_UNDO_SCENARIO_KEYS, derived.ideal),
    latestMiss: latest?.fastSetMiss ?? false,
    consecutiveMisses: latest?.consecutiveFastSetMisses ?? 0,
  };
}
