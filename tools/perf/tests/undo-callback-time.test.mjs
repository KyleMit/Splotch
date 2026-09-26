import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { summarizeUndoActions, undoActionRows } from '../lib/undo-action-stats.mjs';

// Issue #2238's Reduce Motion A/B: three captures per arm, nine undos each, taken
// before the undo driver named `callbackMs`. Its recorded summaries were written
// by the summarizer as it stood before the callback clock existed.
const REDUCE_MOTION_CORPUS = 'perf-profiles/evidence/2026-09-25-issue-2238-reduce-motion-ab';

function corpusArtifacts() {
  const index = JSON.parse(readFileSync(join(ROOT, REDUCE_MOTION_CORPUS, 'index.json'), 'utf8'));
  return index.kept.map(({ file }) =>
    JSON.parse(readFileSync(join(ROOT, REDUCE_MOTION_CORPUS, file), 'utf8'))
  );
}

function withoutCallback(summary) {
  const { callback: _callback, ...scored } = summary;
  return scored;
}

describe('undo callback time', () => {
  it('leaves every recorded scored figure and verdict of the Reduce Motion A/B unchanged', () => {
    const artifacts = corpusArtifacts();
    expect(artifacts).toHaveLength(6);

    for (const artifact of artifacts) {
      const summary = summarizeUndoActions(artifact.undoActions, artifact.report.frames);

      expect(summary.callback).toBeDefined();
      expect(withoutCallback(summary)).toStrictEqual(artifact.undo);
    }
  });

  it('reproduces the per-arm callback figures from the stored timestamps', () => {
    const arm = (prefix) =>
      summarizeUndoActions(
        corpusArtifacts()
          .filter((artifact) => artifact.label.startsWith(prefix))
          .flatMap((artifact) => artifact.undoActions),
        []
      );
    const off = arm('rm-off-');
    const on = arm('rm-on-');

    expect(off.count).toBe(27);
    expect(on.count).toBe(27);
    expect(off.callback).toMatchObject({ p50: 11.9, p95: 17.3 });
    expect(off.callback.max).toBeCloseTo(31.6, 1);
    expect(on.callback).toMatchObject({ p50: 11.3, p95: 16.9 });
    expect(on.callback.max).toBeCloseTo(18.3, 1);
  });

  it('shows a negative next-frame stamp beside the later callback it belongs to', () => {
    const action = {
      startedAt: 1000,
      endedAt: 1032,
      engineMs: 4,
      nextFrameMs: -2,
      callbackMs: 32,
    };

    const summary = summarizeUndoActions([action], []);

    expect(summary.nextFrame).toMatchObject({ p50: -2, max: -2 });
    expect(summary.callback).toMatchObject({ p50: 32, max: 32 });
    expect(summary.passed).toBe(true);
    expect(undoActionRows(summary)[0]).toMatchObject({
      'next frame p50': -2,
      'next frame max': -2,
      'callback p50': 32,
      'callback p95': 32,
      'callback max': 32,
      verdict: 'PASS',
    });
  });

  it('computes the verdict from the next-frame stamp alone', () => {
    const late = { startedAt: 0, endedAt: 400, engineMs: 4, nextFrameMs: 10 };
    const onTime = { startedAt: 0, endedAt: 10, engineMs: 4, nextFrameMs: 10 };

    const lateSummary = summarizeUndoActions([late], []);
    const onTimeSummary = summarizeUndoActions([onTime], []);

    expect(lateSummary.callback.max).toBe(400);
    expect(withoutCallback(lateSummary)).toStrictEqual(withoutCallback(onTimeSummary));
  });

  it('derives the callback time from the timestamps, not the named field', () => {
    const summary = summarizeUndoActions(
      [{ startedAt: 0, endedAt: 12, callbackMs: 123, engineMs: 1, nextFrameMs: 8 }],
      []
    );

    expect(summary.callback).toMatchObject({ p50: 12, max: 12 });
  });

  it('omits the callback clock unless every action carries it', () => {
    const summary = summarizeUndoActions(
      [
        { startedAt: 0, endedAt: 12, engineMs: 1, nextFrameMs: 8 },
        { startedAt: 40, engineMs: 1, nextFrameMs: 8 },
      ],
      []
    );

    expect(summary).not.toHaveProperty('callback');
    expect(Object.keys(undoActionRows(summary)[0])).not.toContain('callback p95');
  });
});
