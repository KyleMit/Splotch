import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTION_FIRST_FRAME_GATE_MS,
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_FRAME_P95_GATE_MS,
} from '../lib/action-stats.mjs';
import {
  mergeActionResults,
  normalizeMatrix,
  renderMarkdown,
  renderReport,
} from '../gen-performance-matrix.mjs';

const temporaryDirectories = [];
const distribution = { p50: 1, p95: 1, p99: 1, max: 1 };
const modeSpecs = [
  { id: 'portrait-light', orientation: 'PORTRAIT', theme: 'light' },
  { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
  { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
  { id: 'landscape-dark', orientation: 'LANDSCAPE', theme: 'dark' },
];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
          lostFrameTimeShare: 0,
          blankPassed: true,
        },
      },
    ])
  );
}

function unavailableMode(spec, reason = 'Device disconnected.') {
  return { ...spec, status: 'unavailable', reason };
}

function capturedManifestMode(spec, overrides = {}) {
  return {
    ...spec,
    status: 'captured',
    drawingProductCommit: 'final123',
    drawing: {},
    ...overrides,
  };
}

function manifestTarget(modes) {
  return {
    id: 'fixture',
    number: 1,
    label: 'Fixture',
    platform: 'test',
    deviceKind: 'physical',
    runtime: 'web',
    environment: 'test device',
    fidelity: 'synthetic-advisory',
    modes,
  };
}

function manifest(modes) {
  return {
    schemaVersion: 3,
    recordedOn: '2026-08-20',
    productCommit: 'final123',
    targets: [manifestTarget(modes)],
  };
}

function normalizedActions(results) {
  return {
    actionCount: results.length,
    passedActionCount: results.filter((result) => result.passed).length,
    finalProductCommitActionCount: results.filter(
      (result) => result.productCommit === 'abcdef123456'
    ).length,
    sources: [{ productCommit: 'abcdef123456' }],
    worst: {
      firstFrameP95: 1,
      postActionFrameP95: 1,
      postActionFrameMax: 1,
    },
    results,
  };
}

function normalizedMode(spec, overrides = {}) {
  return {
    ...spec,
    status: 'captured',
    fidelity: 'synthetic-advisory',
    drawingProductCommit: 'abcdef123456',
    undoProductCommit: 'abcdef123456',
    drawing: drawing(),
    undo: null,
    actions: null,
    ...overrides,
  };
}

function normalizedMatrix(modes) {
  return {
    schemaVersion: 3,
    recordedOn: '2026-08-20',
    productCommit: 'abcdef123456',
    limitations: ['Retained capture.'],
    candidateActions: [],
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
    targets: [
      {
        id: 'fixture',
        number: 1,
        label: 'Android device · web',
        platform: 'Android',
        deviceKind: 'physical',
        runtime: 'web',
        environment: 'test device',
        modes,
      },
    ],
  };
}

function writeActionCapture(directory, name, { orientation, theme, summaries, samples }) {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify({ orientation, theme, repeats: 4, summaries, samples }));
  return name;
}

function actionSample(label, warmup) {
  return {
    label,
    warmup,
    eventType: 'click',
    trusted: true,
    firstFrameMs: 1,
    readyMs: 1,
    postActionFrameGapsMs: [1],
  };
}

describe('deployment matrix report', () => {
  it('keeps profiling controls out of grouped target-mode comparisons', () => {
    const results = [action('idle frame control', true), action('expand action drawer', false)];
    const matrix = normalizedMatrix([
      normalizedMode(modeSpecs[0], { actions: normalizedActions(results) }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    const html = renderReport(matrix);

    expect(html).toContain('<b>1</b> actions compared');
    expect(html).toContain('<b>0/1</b>');
    expect(html).toContain('Action 1: expand action drawer');
    expect(html).toContain('Portrait · Light');
    expect(html).not.toContain('idle frame control');
  });

  it('keeps more than 46 action columns in one dynamically sized heatmap row', () => {
    const results = Array.from({ length: 49 }, (_, index) => action(`action ${index + 1}`, true));
    const matrix = normalizedMatrix([
      normalizedMode(modeSpecs[0], { actions: normalizedActions(results) }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    const html = renderReport(matrix);
    const grids = [...html.matchAll(/<div class="heat-cells">(.*?)<\/div>/g)];

    expect(html).toContain('style="--action-columns:49"');
    expect(html).toContain('grid-template-columns:repeat(var(--action-columns),15px)');
    expect(html).not.toContain('repeat(46,15px)');
    expect(grids).toHaveLength(5);
    for (const [, cells] of grids) {
      expect(cells.match(/class="(?:action-number|heat-cell)/g)).toHaveLength(49);
    }
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

  it('excludes warmup-only labels while retaining the real scored action', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const scoredLabel = "open Settings section: What's New";
    const warmupOnlyLabel = `${scoredLabel}  new`;
    const source = writeActionCapture(manifestDirectory, 'actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      samples: [
        actionSample(warmupOnlyLabel, true),
        actionSample(scoredLabel, true),
        actionSample(scoredLabel, false),
        actionSample(scoredLabel, false),
        actionSample(scoredLabel, false),
      ],
    });
    const matrix = normalizeMatrix(
      manifest([
        capturedManifestMode(modeSpecs[0], {
          actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
        }),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ]),
      manifestDirectory
    );
    const actions = matrix.targets[0].modes[0].actions;

    expect(actions.results).toHaveLength(1);
    expect(actions.results[0]).toMatchObject({ label: scoredLabel, count: 3, passed: true });
    expect(actions.actionCount).toBe(1);
    expect(actions.passedActionCount).toBe(1);
    expect(actions.results.some((result) => result.label === warmupOnlyLabel)).toBe(false);
  });

  it('identifies cumulative provenance in the Markdown summary', () => {
    const matrix = normalizedMatrix([]);
    matrix.targets = [];
    matrix.productCommit = 'final123';
    const markdown = renderMarkdown(matrix);

    expect(markdown).toContain('This deployment-target snapshot');
    expect(markdown).toContain('`final123` is the measured product commit');
    expect(markdown).toContain('npm run gen:performance-matrix');
  });

  it('normalizes and renders the optional candidate-action inventory in manifest order', () => {
    const source = manifest(modeSpecs.map((spec) => unavailableMode(spec)));
    source.candidateActions = [
      {
        priority: 'P0',
        action: 'Pinch & zoom',
        rationale: 'Exercises viewport transforms.',
        applicability: 'Touch targets',
        status: 'Planned',
      },
      {
        priority: 'P2',
        action: 'Recover screenshot',
        rationale: 'Exercises failure recovery.',
      },
    ];
    const matrix = normalizeMatrix(source);
    const markdown = renderMarkdown(matrix);
    const html = renderReport(matrix);

    expect(matrix.candidateActions).toEqual(source.candidateActions);
    expect(markdown).toContain(
      '| P0 | Pinch & zoom | Exercises viewport transforms. | Touch targets | Planned |'
    );
    expect(markdown).toContain('| P2 | Recover screenshot | Exercises failure recovery. | — | — |');
    expect(markdown.indexOf('## Candidate actions')).toBeGreaterThan(
      markdown.indexOf('## Capture limitations')
    );
    expect(markdown.indexOf('## Candidate actions')).toBeLessThan(
      markdown.indexOf('## Commit provenance')
    );
    expect(html).toContain('Pinch &amp; zoom');
    expect(html.indexOf('<h2>Candidate actions</h2>')).toBeGreaterThan(
      html.indexOf('<h2>Capture limitations</h2>')
    );
    expect(html.indexOf('<h2>Candidate actions</h2>')).toBeLessThan(
      html.indexOf('<h2>Coverage</h2>')
    );
  });

  it('keeps schema-v3 manifests without candidate actions backward compatible', () => {
    const matrix = normalizeMatrix(manifest(modeSpecs.map((spec) => unavailableMode(spec))));

    expect(matrix.candidateActions).toEqual([]);
    expect(renderMarkdown(matrix)).not.toContain('## Candidate actions');
    expect(renderReport(matrix)).not.toContain('<h2>Candidate actions</h2>');
  });

  it('rejects incomplete candidate-action entries', () => {
    const source = manifest(modeSpecs.map((spec) => unavailableMode(spec)));
    source.candidateActions = [{ priority: 'P1', action: 'Rotate' }];

    expect(() => normalizeMatrix(source)).toThrow(
      'Performance matrix candidateActions[0].rationale must be text'
    );
  });

  it('reports missing drawing sources as unavailable rather than failed', () => {
    const matrix = normalizeMatrix(
      manifest([
        capturedManifestMode(modeSpecs[0]),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ])
    );
    const markdown = renderMarkdown(matrix);
    const portraitLightRows = markdown
      .split('\n')
      .filter((line) => line.startsWith('| 1. Fixture · Portrait · Light |'));

    expect(
      portraitLightRows.some((line) =>
        line.includes(
          '| Unavailable: not measured | Unavailable: not measured | Unavailable: not measured | Unavailable: not measured |'
        )
      )
    ).toBe(true);
    expect(markdown).not.toContain('**FAIL — / — / — · L—%**');
  });

  it('resolves mode evidence from the manifest directory and preserves missing metrics', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    mkdirSync(join(manifestDirectory, 'captures'));
    const source = writeActionCapture(manifestDirectory, 'captures/actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
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
    });
    const matrix = normalizeMatrix(
      manifest([
        capturedManifestMode(modeSpecs[0], {
          actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
        }),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ]),
      manifestDirectory
    );

    expect(matrix.targets[0].modes[0].actions.worst).toEqual({
      firstFrameP95: null,
      postActionFrameP95: null,
      postActionFrameMax: null,
    });
    expect(renderReport(matrix)).not.toContain('repeat(46,15px)');
  });

  it('retains the same action label independently in separate modes', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const portraitSource = writeActionCapture(manifestDirectory, 'portrait.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      summaries: [
        {
          label: 'expand action drawer',
          count: 3,
          firstFrame: distribution,
          ready: distribution,
          frames: distribution,
          passed: true,
        },
      ],
    });
    const landscapeSource = writeActionCapture(manifestDirectory, 'landscape.json', {
      orientation: 'LANDSCAPE',
      theme: 'light',
      summaries: [
        {
          label: 'expand action drawer',
          count: 3,
          firstFrame: distribution,
          ready: distribution,
          frames: distribution,
          passed: false,
        },
      ],
    });
    const matrix = normalizeMatrix(
      manifest([
        capturedManifestMode(modeSpecs[0], {
          actionSources: [{ source: portraitSource, productCommit: 'portrait', kind: 'full' }],
        }),
        unavailableMode(modeSpecs[1]),
        capturedManifestMode(modeSpecs[2], {
          actionSources: [{ source: landscapeSource, productCommit: 'landscape', kind: 'full' }],
        }),
        unavailableMode(modeSpecs[3]),
      ]),
      manifestDirectory
    );

    expect(matrix.targets[0].modes[0].actions.results[0]).toMatchObject({
      label: 'expand action drawer',
      passed: true,
      productCommit: 'portrait',
    });
    expect(matrix.targets[0].modes[2].actions.results[0]).toMatchObject({
      label: 'expand action drawer',
      passed: false,
      productCommit: 'landscape',
    });
  });

  it('renders unavailable mode cells with their recorded reason', () => {
    const results = [action('expand action drawer', true)];
    const matrix = normalizedMatrix([
      normalizedMode(modeSpecs[0], { actions: normalizedActions(results) }),
      unavailableMode(modeSpecs[1], 'Safari session crashed repeatedly.'),
      ...modeSpecs.slice(2).map((spec) => unavailableMode(spec)),
    ]);

    expect(renderReport(matrix)).toContain('unavailable: Safari session crashed repeatedly.');
    expect(renderMarkdown(matrix)).toContain('Unavailable: Safari session crashed repeatedly.');
  });

  it('rejects capture metadata that does not match its manifest mode', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'actions.json', {
      orientation: 'LANDSCAPE',
      theme: 'light',
      summaries: [],
    });

    expect(() =>
      normalizeMatrix(
        manifest([
          capturedManifestMode(modeSpecs[0], {
            actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
          }),
          ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
        ]),
        manifestDirectory
      )
    ).toThrow('actions.json recorded landscape orientation; expected portrait');
  });

  it('rejects capture theme metadata that does not match its manifest mode', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'actions.json', {
      orientation: 'PORTRAIT',
      theme: 'dark',
      summaries: [],
    });

    expect(() =>
      normalizeMatrix(
        manifest([
          capturedManifestMode(modeSpecs[0], {
            actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
          }),
          ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
        ]),
        manifestDirectory
      )
    ).toThrow('actions.json recorded dark theme; expected light');
  });

  it('rejects captures without explicit theme metadata', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'actions.json', {
      orientation: 'PORTRAIT',
      theme: undefined,
      summaries: [],
    });

    expect(() =>
      normalizeMatrix(
        manifest([
          capturedManifestMode(modeSpecs[0], {
            actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
          }),
          ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
        ]),
        manifestDirectory
      )
    ).toThrow('actions.json is missing theme metadata for portrait / light');
  });

  it('rejects a focused capture whose declared labels are absent', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      summaries: [action('measured action', true)],
    });

    expect(() =>
      normalizeMatrix(
        manifest([
          capturedManifestMode(modeSpecs[0], {
            actionSources: [
              {
                source,
                productCommit: 'final123',
                kind: 'focused',
                labels: ['missing action'],
              },
            ],
          }),
          ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
        ]),
        manifestDirectory
      )
    ).toThrow('actions.json does not contain: missing action');
  });

  it('reports a clear migration error for the previous schema', () => {
    expect(() => normalizeMatrix({ schemaVersion: 2, targets: [] })).toThrow(
      'Performance matrix manifest schemaVersion 2 is unsupported; expected 3. Move each target’s capture fields into four targets[].modes entries.'
    );
  });

  it('requires every target to declare each orientation-theme mode exactly once', () => {
    expect(() =>
      normalizeMatrix(
        manifest([
          unavailableMode(modeSpecs[0]),
          unavailableMode(modeSpecs[1]),
          unavailableMode(modeSpecs[2]),
        ])
      )
    ).toThrow('Target fixture must contain exactly four explicit modes (missing: landscape-dark)');
  });
  describe('preserved evidence', () => {
    // A red gate the raw capture can no longer justify is exactly what preservation
    // has to carry forward intact — recapturing it would quietly turn it green.
    const publishedDrawing = Object.fromEntries(
      ['pen', 'crayon', 'magic', 'eraser'].map((brush) => [
        brush,
        {
          aggregate: {
            runCount: 1,
            paint: { p95: 44, p99: 48, max: 52 },
            lostFrameTimeShare: 0.09,
            blankPassed: false,
            allPhasesPassed: false,
          },
          runs: [
            { source: `perf-profiles/gone/${brush}/real-screen.json`, productCommit: 'final123' },
          ],
        },
      ])
    );

    function publishReport(directory, mode = {}) {
      writeFileSync(
        join(directory, 'data.json'),
        JSON.stringify({
          targets: [
            {
              id: 'fixture',
              label: 'Fixture',
              modes: [{ id: 'portrait-light', drawing: publishedDrawing, undo: null, ...mode }],
            },
          ],
        })
      );
      return 'data.json';
    }

    function preservingManifest(directory, overrides = {}) {
      const source = manifest([
        capturedManifestMode(modeSpecs[0], { drawing: 'preserved' }),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ]);
      source.preservedEvidence = {
        from: publishReport(directory),
        reason: 'The raw captures were local scratch and are gone.',
        ...overrides,
      };
      return source;
    }

    it('copies a published section forward when its raw capture is gone', () => {
      const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
      temporaryDirectories.push(manifestDirectory);

      const matrix = normalizeMatrix(preservingManifest(manifestDirectory), manifestDirectory);
      const mode = matrix.targets[0].modes[0];

      // The published measurements are carried forward untouched. Scoreability is
      // the one thing re-derived, from the fidelity verdict those runs already
      // carry — without it a preserved fidelity-failed cell rendered a bold product
      // FAIL while a freshly captured one with the identical verdict rendered
      // unscoreable.
      expect(mode.drawing.crayon.runs).toEqual(publishedDrawing.crayon.runs);
      expect(mode.drawing.crayon.aggregate).toMatchObject(publishedDrawing.crayon.aggregate);
      expect(mode.drawing.crayon.aggregate.scoreable).toBe(true);
      expect(mode.preservedSections).toEqual(['drawing']);
      expect(matrix.preservedEvidence).toEqual({
        from: 'data.json',
        reason: 'The raw captures were local scratch and are gone.',
      });
    });

    it('states the preservation in both rendered reports', () => {
      const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
      temporaryDirectories.push(manifestDirectory);

      const matrix = normalizeMatrix(preservingManifest(manifestDirectory), manifestDirectory);

      for (const rendered of [renderMarkdown(matrix), renderReport(matrix)]) {
        expect(rendered).toContain('1 cell carry results preserved from data.json');
        expect(rendered).toContain('Fixture · portrait-light (drawing)');
      }
    });

    it('refuses a preserved section with no declared source', () => {
      expect(() =>
        normalizeMatrix(
          manifest([
            capturedManifestMode(modeSpecs[0], { drawing: 'preserved' }),
            ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
          ])
        )
      ).toThrow(
        'Target fixture mode portrait-light marks drawing preserved, but the manifest declares no preservedEvidence source'
      );
    });

    it('refuses a preserved section the published report does not carry', () => {
      const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
      temporaryDirectories.push(manifestDirectory);
      const source = preservingManifest(manifestDirectory);
      source.targets[0].modes[0].actionSources = 'preserved';

      expect(() => normalizeMatrix(source, manifestDirectory)).toThrow(
        'data.json has no actions for fixture mode portrait-light'
      );
    });

    it('requires a stated reason for preserving evidence', () => {
      const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
      temporaryDirectories.push(manifestDirectory);
      const source = preservingManifest(manifestDirectory, { reason: '' });

      expect(() => normalizeMatrix(source, manifestDirectory)).toThrow(
        'Performance matrix preservedEvidence.reason must say why raw inputs are gone'
      );
    });
  });
});

describe('release gate prose', () => {
  const gated = (modes) => {
    const matrix = normalizedMatrix(modes);
    matrix.targets[0].fidelity = 'physical-safari-gated';
    return matrix;
  };
  const failingDrawing = () => {
    const brushes = drawing();
    brushes.crayon.aggregate.blankPassed = false;
    return brushes;
  };

  it('reports the gate target as captured and red when its aggregates fail', () => {
    const matrix = gated(
      modeSpecs.map((spec) => normalizedMode(spec, { drawing: failingDrawing() }))
    );

    expect(renderReport(matrix)).toContain(
      'Android device · web is the calibrated release gate — 4/4 modes captured, 4 of 16 brush aggregates over gate.'
    );
  });

  it('reports the gate target as green when no aggregate is over gate', () => {
    const matrix = gated(modeSpecs.map((spec) => normalizedMode(spec)));

    expect(renderReport(matrix)).toContain(
      '4/4 modes captured, all 16 brush aggregates inside gate.'
    );
  });

  it('calls the gate unavailable only when no mode of it was captured', () => {
    const matrix = gated(
      modeSpecs.map((spec) => ({ ...spec, status: 'unavailable', reason: 'No tunnel.' }))
    );

    expect(renderReport(matrix)).toContain(
      'Android device · web is the calibrated release gate and is unavailable in this campaign.'
    );
  });

  it('says so when no target carries the gate', () => {
    const matrix = normalizedMatrix(modeSpecs.map((spec) => normalizedMode(spec)));

    expect(renderReport(matrix)).toContain(
      'No target in this campaign carries the calibrated Safari release gate.'
    );
  });
});
