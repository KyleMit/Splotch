import { describe, expect, it } from 'vitest';
import { renderReport } from '../perf/deployment-matrix-report.mjs';

const distribution = { p50: 1, p95: 1, p99: 1, max: 1 };

function action(label, passed) {
  return {
    label,
    count: 3,
    firstFrame: distribution,
    ready: distribution,
    postActionFrames: distribution,
    passed,
  };
}

function drawing() {
  return Object.fromEntries(
    ['pen', 'crayon', 'magic', 'eraser'].map((brush) => [
      brush,
      {
        aggregate: {
          paint: { p95: 1, p99: 1, max: 1 },
        },
      },
    ])
  );
}

describe('deployment matrix report', () => {
  it('keeps profiling controls out of the comparable action heatmap', () => {
    const results = [action('idle frame control', true), action('expand action drawer', false)];
    const html = renderReport({
      recordedOn: '2026-07-31',
      productCommit: 'abcdef123456',
      gates: {
        drawing: { paintP95Ms: 20, paintP99Ms: 33, paintMaxMs: 50 },
        actions: { firstFrameP95Ms: 32, postActionFrameP95Ms: 20, postActionFrameMaxMs: 32 },
      },
      targets: [
        {
          number: 1,
          label: 'Android device · web',
          runtime: 'web',
          environment: 'test device',
          status: 'captured',
          fidelity: 'physical-web-advisory',
          drawing: drawing(),
          undo: null,
          actions: {
            actionCount: results.length,
            passedActionCount: 1,
            results,
          },
        },
      ],
    });

    expect(html).toContain('<b>1</b> actions per target');
    expect(html).toContain('<b>0/1</b>');
    expect(html).toContain('Action 1: expand action drawer');
    expect(html).not.toContain('idle frame control');
  });
});
