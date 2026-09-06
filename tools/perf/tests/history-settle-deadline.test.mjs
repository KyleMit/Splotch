import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_UNDO_DEPTH } from '../../../web/src/lib/drawing/undoHistory.ts';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8');
const literal = (source, name) => {
  const match = source.match(new RegExp(`const ${name} = ([\\d_]+);`))?.[1];
  expect(match, `${name} literal`).toBeDefined();
  return Number(match.replaceAll('_', ''));
};

// The stall the 2026-09-06 runner traces measured between a crayon burst and
// the first history poll (issue 1578): 4,961 / 5,911 / 9,673 ms, before the
// first fold timer could fire. The deadline must hold the worst fold backlog a
// scenario can leave plus this, with room, or a slow runner reads an unsettled
// history on every run and the steady-state table never fills in.
const POST_BURST_STALL_ALLOWANCE_MS = 10_000;

describe('history settle deadline', () => {
  it('covers the deepest fold backlog a scenario leaves plus the measured post-burst stall', () => {
    const harness = read('tools', 'perf', 'web', 'run-undo-scenarios.mjs');
    const renderer = read('web', 'src', 'lib', 'drawing', 'tiledRenderer.ts');
    const deadlineMs = literal(harness, 'DEFAULT_HISTORY_SETTLE_TIMEOUT_MS');
    const foldIdleMs = literal(renderer, 'TILE_HISTORY_FOLD_IDLE_MS');
    const minRetained = literal(renderer, 'MIN_TILED_UNDO_COMMANDS');
    // Every scenario draws two strokes past the depth cap (the harness's
    // STROKES default), and the byte budget can retain as few as
    // MIN_TILED_UNDO_COMMANDS of them, so the rest fold one idle period apart.
    const strokes = MAX_UNDO_DEPTH + 2;
    const worstFolds = strokes - minRetained;

    expect(deadlineMs).toBeGreaterThanOrEqual(
      worstFolds * foldIdleMs + POST_BURST_STALL_ALLOWANCE_MS
    );
  });
});
