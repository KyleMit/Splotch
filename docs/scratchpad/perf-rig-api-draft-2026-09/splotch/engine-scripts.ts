// The engine-internals family stays Splotch code: perf:web:undo*, perf:web:replay and
// perf:ios:webkit:gates drive /dev/engine through its imperative API. They compose the package's
// channel and scoring primitives instead of being a scenario kind whose only values are Splotch's.
import {
  openChannel,
  evaluateCommit,
  validateFastSetHistory,
  deriveIdealFastSet,
  evaluateFastSet,
  appendFullRun,
  type TargetDefinition,
} from 'perf-rig';
import { splotch } from './app.js';
import { gates } from './gates.js';

export const UNDO_CASES = [
  { key: 'long-squiggles', exercises: ['commit', 'undo'] },
  { key: 'short-marks', exercises: ['commit'] },
  { key: 'mixed', exercises: ['commit', 'depth-cap'] },
  { key: 'multi-finger', exercises: ['multi-pointer'] },
  { key: 'scribbles', exercises: ['commit'] },
  { key: 'crayon-squiggles', exercises: ['crayon-fold'] },
  { key: 'crayon-scribbles', exercises: ['crayon-pass-split'] },
] as const;

export const FAST_UNDO_SCENARIO_KEYS = ['multi-finger', 'crayon-scribbles'] as const;

const ENGINE_ROUTE = { path: '/dev/engine', ready: 'window.__engineReady === true' } as const;

export async function runUndoScenarios(
  target: TargetDefinition,
  options: {
    readonly keys: readonly string[];
    readonly historyPath?: string;
    readonly history?: unknown;
  }
) {
  const channel = await openChannel(splotch, target, ENGINE_ROUTE);
  try {
    const measurements: { key: string; first: number[]; confirmation?: number[] }[] = [];
    for (const key of options.keys) {
      await channel.evaluate(`window.__engine.clearCanvas()`);
      const draw = await channel.evaluate<number[]>(
        `(async () => { /* run-undo-scenarios.mjs: drawStrokes for ${key}, settle via getUndoDebug, return engine.commit durations */ })()`
      );
      measurements.push({ key, first: draw });
    }
    const verdict = evaluateCommit(measurements, gates.commit!);
    for (const c of verdict.cases.filter((x) => x.outcome === 'confirmed-breach')) {
      const again = await channel.evaluate<number[]>(
        `(async () => { /* re-measure ${c.key} once */ })()`
      );
      measurements.find((m) => m.key === c.key)!.confirmation = again;
    }
    const confirmed = evaluateCommit(measurements, gates.commit!);
    if (options.history !== undefined) {
      const history = validateFastSetHistory(
        options.history,
        UNDO_CASES.map((c) => c.key)
      );
      const ideal = deriveIdealFastSet(history, UNDO_CASES, FAST_UNDO_SCENARIO_KEYS.length);
      const drift = evaluateFastSet(history, FAST_UNDO_SCENARIO_KEYS, UNDO_CASES);
      const next = appendFullRun(
        history,
        {
          startedAt: new Date().toISOString(),
          budgetMs: gates.commit!.budgetMs,
          cases: measurements.map((m) => ({
            key: m.key,
            measuredMs: Math.max(...m.first),
            headroomRatio: 1,
            breached: false,
          })),
        },
        50
      );
      return { verdict: confirmed, ideal, drift, next };
    }
    return { verdict: confirmed };
  } finally {
    await channel.close();
  }
}

export async function replayRecording(target: TargetDefinition, recordingPath: string) {
  const channel = await openChannel(splotch, target, ENGINE_ROUTE);
  try {
    await channel.trace?.start();
    await channel.evaluate(
      `(async () => { /* replay-input-recording.mjs: replayInPage(window.__engine, ${JSON.stringify(recordingPath)}) */ })()`
    );
    return {
      trace: await channel.trace?.stop(),
      undo: await channel.evaluate('window.__engine.getUndoDebug()'),
    };
  } finally {
    await channel.close();
  }
}

export async function ipadEngineGates(target: TargetDefinition, deviceId: string) {
  const channel = await openChannel(splotch, target, {
    ...ENGINE_ROUTE,
    ready: 'window.__engine && window.__engine.getUndoDebug',
    device: { id: deviceId },
  });
  try {
    await channel.evaluate('/* engine-gates.js rendered with __perf* overrides */');
    return channel.waitForGlobal<unknown[]>('window.__perfRows', { timeoutMs: 20 * 60_000 });
  } finally {
    await channel.close();
  }
}
