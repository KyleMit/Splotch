import { describe, expect, it } from 'vitest';
import {
  mergeActionResults,
  renderMarkdown,
  renderReport,
} from '../perf/deployment-matrix-report.mjs';

const distribution = { p50: 1, p95: 1, p99: 1, max: 1 };

function action(label, passed, productCommit = 'abcdef123456') {
  return {
    label,
    count: 3,
    firstFrame: distribution,
    ready: distribution,
    postActionFrames: distribution,
    passed,
    source: 'perf-profiles/actions.json',
    productCommit,
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
      limitations: ['Retained capture.'],
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
          drawingProductCommit: '123456abcdef',
          undoProductCommit: '123456abcdef',
          drawing: drawing(),
          undo: null,
          actions: {
            actionCount: results.length,
            passedActionCount: 1,
            finalProductCommitActionCount: 1,
            sources: [{ productCommit: 'abcdef123456' }],
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

  it('applies focused action captures only to their measured labels', () => {
    const baseline = {
      results: [
        action('expand action drawer', false, 'old'),
        action('change ink color', false, 'old'),
      ],
    };
    const focused = { results: [action('expand action drawer', true, 'final')] };

    expect(mergeActionResults([baseline, focused])).toEqual([
      action('expand action drawer', true, 'final'),
      action('change ink color', false, 'old'),
    ]);
  });

  it('identifies cumulative provenance in the Markdown summary', () => {
    const markdown = renderMarkdown({
      recordedOn: '2026-07-31',
      productCommit: 'final123',
      limitations: [],
      gates: {
        drawing: {
          paintP95Ms: 20,
          paintP99Ms: 33,
          paintMaxMs: 50,
          lostFrameTimeShare: 0.01,
        },
        undo: { engineP95Ms: 20, nextFrameP95Ms: 33, nextFrameMaxMs: 50 },
        actions: { firstFrameP95Ms: 32, postActionFrameP95Ms: 20, postActionFrameMaxMs: 32 },
      },
      targets: [],
    });

    expect(markdown).toContain('This cumulative snapshot');
    expect(markdown).toContain('`final123` is the final performance-affecting product commit');
  });
});
