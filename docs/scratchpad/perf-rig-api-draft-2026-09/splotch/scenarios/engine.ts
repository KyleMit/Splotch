// The engine-internals family: perf:web:undo* and perf:web:replay drive /dev/engine directly.
import { defineScenario } from 'perf-rig';

export const undoScenarios = defineScenario({
  kind: 'engine',
  id: 'undo-scenarios',
  description:
    'Seven shaped sessions against the tiled-history engine, reading getUndoDebug between them.',
  cases: [
    {
      key: 'long-squiggles',
      label: 'Long squiggles',
      exercises: ['commit', 'undo'],
      run: 'drawStrokes(E, longSquiggle, 22)',
    },
    {
      key: 'short-marks',
      label: 'Short dot/dash marks',
      exercises: ['commit'],
      run: 'drawStrokes(E, shortMark, 22)',
    },
    {
      key: 'mixed',
      label: 'A mix',
      exercises: ['commit', 'depth-cap'],
      run: 'drawStrokes(E, mixed, 22)',
    },
    {
      key: 'multi-finger',
      label: 'Five-finger drags',
      exercises: ['multi-pointer'],
      run: 'multiFinger(E, 5)',
    },
    {
      key: 'scribbles',
      label: 'Pen scribbles',
      exercises: ['commit'],
      run: 'drawStrokes(E, scribble, 22)',
    },
    {
      key: 'crayon-squiggles',
      label: 'Crayon squiggles',
      exercises: ['crayon-fold'],
      run: 'E.setCrayonMode(true); drawStrokes(E, longSquiggle, 22)',
    },
    {
      key: 'crayon-scribbles',
      label: 'Crayon scribbles (mid-stroke pass splits)',
      exercises: ['crayon-pass-split'],
      run: 'E.setCrayonMode(true); drawStrokes(E, scribble, 22)',
    },
  ],
  quiescent:
    '(d => d.pendingCommands === 0 && d.historyLength <= d.snapshots)(window.__engine.getUndoDebug())',
  settle: { stableSamples: 3, budgetMs: 45_000 },
});

export const FAST_UNDO_SCENARIO_KEYS = ['multi-finger', 'crayon-scribbles'] as const;

export const replayRecording = (recordingPath: string) =>
  defineScenario({
    kind: 'engine',
    id: `replay:${recordingPath}`,
    description: 'Replay a real finger recording through the engine at recorded timing.',
    cases: [
      {
        key: 'replay',
        label: 'Recorded input',
        exercises: ['commit', 'undo'],
        run: `replayInPage(E, ${JSON.stringify(recordingPath)})`,
      },
    ],
    quiescent: '(d => d.pendingCommands === 0)(window.__engine.getUndoDebug())',
    settle: { stableSamples: 3, budgetMs: 45_000 },
  });
