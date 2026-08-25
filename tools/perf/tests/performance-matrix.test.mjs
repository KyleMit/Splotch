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

function writeActionCapture(
  directory,
  name,
  { orientation, theme, summaries, samples, transport, captureRuntime, engine }
) {
  const path = join(directory, name);
  writeFileSync(
    path,
    JSON.stringify({
      orientation,
      theme,
      repeats: 4,
      summaries,
      samples,
      transport,
      captureRuntime,
      engine,
    })
  );
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

  // ADR-0142 amendment (issue 1324): an iPad Safari rotation first frame is
  // 0-2 ms by construction, so it is declared N/A instead of publishing a green
  // 0. Applicability keys on the capture RUNTIME — `transport: "browser"` is
  // the Appium web transport generally, and an Android Chrome artifact records
  // it too, so an artifact carrying that transport but no ios-safari runtime
  // (and no target declaring one) must keep its gate.
  it('declares Safari rotation first frames not-applicable and keeps other runtimes gated', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const rotationLabel = 'with ink: PORTRAIT to LANDSCAPE rotation';
    const rotationSamples = Array.from({ length: 4 }, (_, index) => ({
      ...actionSample(rotationLabel, index === 0),
      firstFrameMs: 100,
    }));
    const safariSource = writeActionCapture(manifestDirectory, 'safari-actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      transport: 'browser',
      captureRuntime: 'ios-safari',
      samples: rotationSamples,
    });
    const appiumAndroidSource = writeActionCapture(manifestDirectory, 'android-actions.json', {
      orientation: 'PORTRAIT',
      theme: 'dark',
      transport: 'browser',
      samples: rotationSamples,
    });
    const matrix = normalizeMatrix(
      manifest([
        capturedManifestMode(modeSpecs[0], {
          actionSources: [{ source: safariSource, productCommit: 'final123', kind: 'full' }],
        }),
        capturedManifestMode(modeSpecs[1], {
          actionSources: [{ source: appiumAndroidSource, productCommit: 'final123', kind: 'full' }],
        }),
        ...modeSpecs.slice(2).map((spec) => unavailableMode(spec)),
      ]),
      manifestDirectory
    );
    const safariResult = matrix.targets[0].modes[0].actions.results[0];
    const androidResult = matrix.targets[0].modes[1].actions.results[0];

    expect(safariResult).toMatchObject({ label: rotationLabel, passed: true });
    expect(safariResult.firstFrame.na).toBe(true);
    expect(matrix.targets[0].modes[0].actions.worst.firstFrameP95).toBeNull();
    expect(androidResult.firstFrame.na).toBeUndefined();
    expect(androidResult.passed).toBe(false);
    const html = renderReport(matrix);
    expect(html).toContain('first P95 N/A');
    const markdown = renderMarkdown(matrix);
    expect(markdown).toContain('N/A');
  });

  // Review round 2: a cross-engine artifact (campaign acceptance only tells web
  // from native) must not fold under a target declaring another runtime —
  // silently preferring the target scored an android-chrome capture's rotation
  // rows as ios-safari N/A. Both present and different is a refusal, not an
  // ordering.
  it('refuses an artifact whose recorded runtime disagrees with the target’s declared one', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'cross-engine-actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      transport: 'browser',
      captureRuntime: 'android-chrome',
      samples: [
        actionSample('with ink: PORTRAIT to LANDSCAPE rotation', true),
        ...Array.from({ length: 3 }, () =>
          actionSample('with ink: PORTRAIT to LANDSCAPE rotation', false)
        ),
      ],
    });
    const source_manifest = manifest([
      capturedManifestMode(modeSpecs[0], {
        actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
      }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    source_manifest.targets[0].id = 'ipad-device-web';

    expect(() => normalizeMatrix(source_manifest, manifestDirectory)).toThrow(
      'records captureRuntime android-chrome, but target ipad-device-web declares ios-safari'
    );
  });

  // ADR-0142's second amendment: the desktop runtime spans three engines, and
  // only WebKit shares Safari's inert construction (measured in
  // perf-profiles/evidence/2026-08-25-desktop-rotation-first-frames/). A
  // mac-safari rotation row is N/A; a mac-chrome one keeps its gate.
  it('declares desktop WebKit rotation first frames not-applicable and keeps Chromium gated', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const rotationLabel = 'with ink: PORTRAIT to LANDSCAPE rotation';
    const rotationSamples = Array.from({ length: 4 }, (_, index) => ({
      ...actionSample(rotationLabel, index === 0),
      firstFrameMs: 100,
    }));
    const capture = (name, engine) =>
      writeActionCapture(manifestDirectory, name, {
        orientation: 'PORTRAIT',
        theme: 'light',
        captureRuntime: 'desktop-playwright',
        engine,
        samples: rotationSamples,
      });
    const foldedFor = (targetId, source) => {
      const source_manifest = manifest([
        capturedManifestMode(modeSpecs[0], {
          actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
        }),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ]);
      source_manifest.targets[0].id = targetId;
      return normalizeMatrix(source_manifest, manifestDirectory).targets[0].modes[0].actions
        .results[0];
    };

    const webkitResult = foldedFor('mac-safari', capture('webkit-actions.json', 'webkit'));
    expect(webkitResult.firstFrame.na).toBe(true);
    expect(webkitResult.passed).toBe(true);

    const chromiumResult = foldedFor('mac-chrome', capture('chromium-actions.json', 'chromium'));
    expect(chromiumResult.firstFrame.na).toBeUndefined();
    expect(chromiumResult.passed).toBe(false);
  });

  // The engine gets the runtime's agreement rule: a capture recorded under one
  // engine must not fold into a target declaring another, because the rotation
  // rules it is scored under are the engine's.
  it('refuses an artifact whose recorded engine disagrees with the target’s declared one', () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(manifestDirectory);
    const source = writeActionCapture(manifestDirectory, 'cross-desktop-actions.json', {
      orientation: 'PORTRAIT',
      theme: 'light',
      captureRuntime: 'desktop-playwright',
      engine: 'chromium',
      samples: [
        actionSample('with ink: PORTRAIT to LANDSCAPE rotation', true),
        ...Array.from({ length: 3 }, () =>
          actionSample('with ink: PORTRAIT to LANDSCAPE rotation', false)
        ),
      ],
    });
    const source_manifest = manifest([
      capturedManifestMode(modeSpecs[0], {
        actionSources: [{ source, productCommit: 'final123', kind: 'full' }],
      }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    source_manifest.targets[0].id = 'mac-safari';

    expect(() => normalizeMatrix(source_manifest, manifestDirectory)).toThrow(
      'records engine chromium, but target mac-safari declares webkit'
    );
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
      const drawing = mode.drawing ?? publishedDrawing;
      writeFileSync(
        join(directory, 'data.json'),
        JSON.stringify({
          targets: [
            {
              id: 'fixture',
              label: 'Fixture',
              modes: [{ id: 'portrait-light', undo: null, ...mode, drawing }],
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
      // Copied forward, and not scored: a preserved verdict cannot be re-derived
      // under current expectations, so it is kept as provenance rather than allowed
      // to drive the plots and the failure ranking.
      expect(mode.drawing.crayon.aggregate.scoreable).toBe(false);
      expect(mode.preservedSections).toEqual(['drawing']);
      expect(matrix.preservedEvidence).toEqual({
        from: 'data.json',
        reason: 'The raw captures were local scratch and are gone.',
      });
    });

    // The hazard this guards is structural and it already bit once: the committed
    // matrix sets `preservedEvidence.from` to `data.json`, so the generator
    // preserves from ITS OWN previous output. Anything a regeneration drops from a
    // preserved run is dropped from the source the NEXT regeneration reads, and the
    // loss compounds silently — a revision that moved the run-level fidelity verdict
    // to a new key destroyed every historical verdict in one pass, recoverable only
    // because git still had the file.
    //
    // So regenerating from your own output has to be a fixpoint. This feeds the
    // first result back in as the published report and requires the second to match.
    it('is a fixpoint when it preserves from its own output', () => {
      const manifestDirectory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
      temporaryDirectories.push(manifestDirectory);
      const withVerdicts = {
        ...publishedDrawing,
        crayon: {
          ...publishedDrawing.crayon,
          runs: [
            {
              ...publishedDrawing.crayon.runs[0],
              fidelity: { passed: false, checks: { coalescing: false, cadence: true } },
            },
          ],
        },
      };
      publishReport(manifestDirectory, { drawing: withVerdicts });
      const source = manifest([
        capturedManifestMode(modeSpecs[0], { drawing: 'preserved' }),
        ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
      ]);
      source.preservedEvidence = { from: 'data.json', reason: 'Raw captures are gone.' };

      const first = normalizeMatrix(source, manifestDirectory);
      writeFileSync(join(manifestDirectory, 'data.json'), JSON.stringify(first));
      const second = normalizeMatrix(source, manifestDirectory);

      expect(second.targets[0].modes[0].drawing).toEqual(first.targets[0].modes[0].drawing);
      // Named separately from the deep-equal because this is the field that was
      // lost: it is provenance AND the input the next regeneration preserves from.
      expect(second.targets[0].modes[0].drawing.crayon.runs[0].fidelity).toEqual({
        passed: false,
        checks: { coalescing: false, cadence: true },
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

// Issue 1297: the gesture-repeat count decides a cell's first-touch-to-repeat
// mix, so runs at different recorded counts measured different quantities. The
// matrix publishes each run's count and refuses to fold two different ones; a
// run predating the field (null) proves nothing and folds as before.
describe('the gesture-repeat contract in a folded cell', () => {
  function writeDrawingCapture(directory, name, gestureRepeats) {
    writeFileSync(
      join(directory, name),
      JSON.stringify({
        orientation: 'PORTRAIT',
        theme: 'light',
        gestureRepeats,
        summaries: {
          phases: [
            {
              key: 'blank',
              paintLatencyMs: { p50: 1, p95: 1, p99: 1, max: 1 },
              pacing: { lostFrameTimeShare: 0 },
            },
          ],
        },
      })
    );
    return name;
  }

  it('publishes each run’s recorded count and refuses to fold two different ones', () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(directory);
    const ten = writeDrawingCapture(directory, 'pen-ten.json', 10);
    const legacy = writeDrawingCapture(directory, 'pen-legacy.json', undefined);
    const modesWith = (pen) => [
      capturedManifestMode(modeSpecs[0], { drawing: { pen } }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ];

    const matrix = normalizeMatrix(manifest(modesWith([ten, legacy])), directory);
    const runs = matrix.targets[0].modes[0].drawing.pen.runs;
    expect(runs.map((run) => run.gestureRepeats)).toEqual([10, null]);

    const three = writeDrawingCapture(directory, 'pen-three.json', 3);
    expect(() => normalizeMatrix(manifest(modesWith([ten, three])), directory)).toThrow(
      'folds captures with different gesture-repeat counts (10, 3)'
    );
  });
});

// Issue 1292's companion boundary: HOW the repeats were fed ink. An unrefilled
// eraser run is optimistic by an unknown amount, so folding it beside a
// refilled one launders the optimism into the cell. A run predating the field
// (null) proves nothing and folds as before.
describe('the gesture-plan contract in a folded cell', () => {
  function writeDrawingCapture(directory, name, gesturePlan) {
    writeFileSync(
      join(directory, name),
      JSON.stringify({
        orientation: 'PORTRAIT',
        theme: 'light',
        gesturePlan,
        summaries: {
          phases: [
            {
              key: 'blank',
              paintLatencyMs: { p50: 1, p95: 1, p99: 1, max: 1 },
              pacing: { lostFrameTimeShare: 0 },
            },
          ],
        },
      })
    );
    return name;
  }

  it('publishes each run’s recorded plan and refuses to fold two different ones', () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));
    temporaryDirectories.push(directory);
    const refilled = writeDrawingCapture(directory, 'pen-refilled.json', 'fixed-geometry-refilled');
    const legacy = writeDrawingCapture(directory, 'pen-legacy.json', undefined);
    const modesWith = (pen) => [
      capturedManifestMode(modeSpecs[0], { drawing: { pen } }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ];

    const matrix = normalizeMatrix(manifest(modesWith([refilled, legacy])), directory);
    const runs = matrix.targets[0].modes[0].drawing.pen.runs;
    expect(runs.map((run) => run.gesturePlan)).toEqual(['fixed-geometry-refilled', null]);

    const unrefilled = writeDrawingCapture(directory, 'pen-unrefilled.json', 'fixed-geometry');
    expect(() => normalizeMatrix(manifest(modesWith([refilled, unrefilled])), directory)).toThrow(
      'folds captures under different gesture plans (fixed-geometry-refilled, fixed-geometry)'
    );
  });
});

// Issue 1290's surviving claim: the matrix publishes one capture per cell and a
// single capture decides a pass/fail gate. Its spread figures were retracted
// twice, so the matrix states the structural fact — prose, runCount, tooltip
// basis — and publishes no figure. The verdict itself must not change.
describe('single-capture verdict provenance', () => {
  const failingAggregate = (runCount) => ({
    runCount,
    paint: { p95: 30, p99: 40, max: 60 },
    lostFrameTimeShare: 0.027,
    blankPassed: false,
  });

  it('states the single-capture basis in prose without resurrecting retracted figures', () => {
    const brushes = drawing();
    brushes.magic.aggregate = failingAggregate(1);
    const matrix = normalizedMatrix([
      normalizedMode(modeSpecs[0], { drawing: brushes }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    const markdown = renderMarkdown(matrix);

    expect(markdown).toContain('provisional until it has been compared against the previous run');
    expect(markdown).toContain('retracted twice');
    expect(markdown).not.toContain('2.71');
    expect(markdown).toContain('**FAIL 30 / 40 / 60 · L2.7%**');
  });

  it('states each fresh cell’s capture basis in the plot tooltips, and none for preserved cells', () => {
    const brushes = drawing();
    brushes.magic.aggregate = failingAggregate(1);
    brushes.crayon.aggregate = failingAggregate(4);
    brushes.eraser.aggregate = {
      ...failingAggregate(1),
      scoreable: false,
      unscoreableReason: 'preserved: no current verdict',
    };
    brushes.pen.aggregate.runCount = 0;
    const matrix = normalizedMatrix([
      normalizedMode(modeSpecs[0], { drawing: brushes }),
      ...modeSpecs.slice(1).map((spec) => unavailableMode(spec)),
    ]);
    const html = renderReport(matrix);

    expect(html).toContain('· 1 capture');
    expect(html).toContain('· 4 captures');
    // A preserved cell's runCount is an inherited claim, and a zero-run cell
    // has no basis to state — neither asserts one.
    expect(html).not.toContain('· 0 captures');
    expect(html.match(/capture · unscoreable: preserved/g)).toBeNull();
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
