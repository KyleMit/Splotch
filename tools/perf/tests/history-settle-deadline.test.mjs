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
  const harness = read('tools', 'perf', 'web', 'run-undo-scenarios.mjs');
  const renderer = read('web', 'src', 'lib', 'drawing', 'tiledRenderer.ts');
  // The harness carries its own copy of the depth cap and derives every
  // scenario's stroke count from it, so the guard reads both as the harness
  // wrote them rather than recomputing them from the product constant — the
  // rival review mutated the harness default and a recomputed count never
  // noticed.
  const harnessDepth = literal(harness, 'MAX_UNDO_DEPTH');
  const strokesPastDepth = harness.match(
    /const DEFAULT_SCENARIO_STROKES = MAX_UNDO_DEPTH \+ (\d+);/
  )?.[1];
  expect(strokesPastDepth, 'DEFAULT_SCENARIO_STROKES derivation').toBeDefined();
  const defaultStrokes = harnessDepth + Number(strokesPastDepth);

  it('draws to the depth cap the product actually enforces', () => {
    expect(harnessDepth).toBe(MAX_UNDO_DEPTH);
  });

  it('covers the deepest fold backlog a scenario leaves plus the measured post-burst stall', () => {
    const deadlineMs = literal(harness, 'DEFAULT_HISTORY_SETTLE_TIMEOUT_MS');
    const foldIdleMs = literal(renderer, 'TILE_HISTORY_FOLD_IDLE_MS');
    const minRetained = literal(renderer, 'MIN_TILED_UNDO_COMMANDS');
    // The byte budget can retain as few as MIN_TILED_UNDO_COMMANDS of a
    // scenario's strokes, so the rest fold one idle period apart.
    const worstFolds = defaultStrokes - minRetained;

    expect(deadlineMs).toBeGreaterThanOrEqual(
      worstFolds * foldIdleMs + POST_BURST_STALL_ALLOWANCE_MS
    );
  });
});
