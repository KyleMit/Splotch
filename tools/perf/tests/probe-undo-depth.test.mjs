// The app's undo depth cap, restated in the iPad gates probe, a console snippet
// that cannot import it. A copy that falls behind the cap stops filling the
// stack, so the oldest-entry fold + shift overflow path the gates exist to time
// quietly stops running, and every number still looks plausible.
//
// paced-crayon-session.js restates the same counts on purpose and is left out:
// it is the ADR-0173 release workload, held byte for byte to the 2026-09-18
// baseline by commit-contract.test.mjs, so it must not follow the cap.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { MAX_UNDO_DEPTH } from '../../../web/src/lib/drawing/undoHistory.ts';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

function declared(source, name) {
  const values = [...source.matchAll(new RegExp(`const ${name} = (\\d+);`, 'g'))].map((match) =>
    Number(match[1])
  );
  expect(values, `const ${name} declared exactly once`).toHaveLength(1);
  return values[0];
}

describe('the undo depth the iPad gates probe restates', () => {
  const gates = read('tools/perf/probes/engine-gates.js');
  // The desktop harness drives the same scenarios, and history-settle-deadline
  // already pins its depth copy; the probe overshoots the cap by what it does.
  const harnessOvershoot = Number(
    read('tools/perf/web/run-undo-scenarios.mjs').match(
      /const DEFAULT_SCENARIO_STROKES = MAX_UNDO_DEPTH \+ (\d+);/
    )?.[1]
  );

  it('matches the app cap', () => {
    expect(declared(gates, 'MAX_UNDO_DEPTH')).toBe(MAX_UNDO_DEPTH);
  });

  it('draws past the cap as far as the desktop harness', () => {
    expect(harnessOvershoot).toBeGreaterThan(0);
    expect(declared(gates, 'STROKES_PAST_UNDO_DEPTH')).toBe(harnessOvershoot);
  });

  // As written, so a probe that declares the copy but draws a bare count fails.
  it('derives its default stroke count from the copy', () => {
    expect(gates).toMatch(/\? 6 : MAX_UNDO_DEPTH \+ STROKES_PAST_UNDO_DEPTH\);/);
  });
});
