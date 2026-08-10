import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTION_FIRST_FRAME_GATE_MS,
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_FRAME_P95_GATE_MS,
} from '../action-stats.mjs';
import {
  mergeActionResults,
  normalizeMatrix,
  renderMarkdown,
  renderReport,
} from '../deployment-matrix-report.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
        actions: {
          firstFrameP95Ms: ACTION_FIRST_FRAME_GATE_MS,
          postActionFrameP95Ms: ACTION_FRAME_P95_GATE_MS,
          postActionFrameMaxMs: ACTION_FRAME_MAX_GATE_MS,
        },
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
        actions: {
          firstFrameP95Ms: ACTION_FIRST_FRAME_GATE_MS,
          postActionFrameP95Ms: ACTION_FRAME_P95_GATE_MS,
          postActionFrameMaxMs: ACTION_FRAME_MAX_GATE_MS,
        },
      },
      targets: [],
    });

    expect(markdown).toContain('This cumulative snapshot');
    expect(markdown).toContain('`final123` is the final performance-affecting product commit');
  });

  it('resolves evidence from the manifest directory and preserves missing metrics', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    mkdirSync(join(manifestDirectory, 'captures'));
    writeFileSync(
      join(manifestDirectory, 'captures/actions.json'),
      JSON.stringify({
        repeats: 4,
        summaries: [
          {
            label: 'expand action drawer',
            count: 3,
            firstFrame: { p50: null, p95: null, p99: null, max: null },
            ready: distribution,
            frames: { p50: null, p95: null, p99: null, max: null },
            passed: false,
          },
          {
            label: 'idle frame control',
            count: 3,
            firstFrame: distribution,
            ready: distribution,
            frames: distribution,
            passed: true,
          },
        ],
      })
    );
    const matrix = normalizeMatrix(
      {
        recordedOn: '2026-07-31',
        productCommit: 'final123',
        targets: [
          {
            id: 'fixture',
            number: 1,
            label: 'Fixture',
            status: 'captured',
            drawingProductCommit: 'final123',
            drawing: {},
            actionSources: [
              {
                source: 'captures/actions.json',
                productCommit: 'final123',
                kind: 'full',
              },
            ],
          },
        ],
      },
      manifestDirectory
    );

    expect(matrix.targets[0].actions.worst).toEqual({
      firstFrameP95: null,
      postActionFrameP95: null,
      postActionFrameMax: null,
    });
    expect(renderReport(matrix)).not.toContain('repeat(46,15px)');
  });

  it('rejects a focused capture whose declared labels are absent', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    writeFileSync(
      join(manifestDirectory, 'actions.json'),
      JSON.stringify({ summaries: [action('measured action', true)] })
    );

    expect(() =>
      normalizeMatrix(
        {
          recordedOn: '2026-07-31',
          productCommit: 'final123',
          targets: [
            {
              status: 'captured',
              drawingProductCommit: 'final123',
              drawing: {},
              actionSources: [
                {
                  source: 'actions.json',
                  productCommit: 'final123',
                  kind: 'focused',
                  labels: ['missing action'],
                },
              ],
            },
          ],
        },
        manifestDirectory
      )
    ).toThrow('actions.json does not contain: missing action');
  });
});
