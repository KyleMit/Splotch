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

function writeActionCapture(directory, name, { orientation, theme, summaries }) {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify({ orientation, theme, repeats: 4, summaries }));
  return name;
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

  it('identifies cumulative provenance in the Markdown summary', () => {
    const matrix = normalizedMatrix([]);
    matrix.targets = [];
    matrix.productCommit = 'final123';
    const markdown = renderMarkdown(matrix);

    expect(markdown).toContain('This cumulative snapshot');
    expect(markdown).toContain('`final123` is the final performance-affecting product commit');
    expect(markdown).toContain('npm run gen:performance-matrix');
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
});
