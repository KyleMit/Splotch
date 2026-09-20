import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { summarizeActions } from '../lib/action-stats.mjs';
import {
  generateDeploymentMatrixReport,
  normalizeMatrix,
  renderReport,
} from '../gen-performance-matrix.mjs';

const fixtureDirectory = join(import.meta.dirname, 'fixtures', 'frame-stamp-matrix');
const cases = [
  {
    targetId: 'android-device-web',
    label: 'clear drawing',
    frameStamps: {
      frames: 380,
      actual: { p50: 16.4, p95: 38.8, max: 43.3 },
      p95DeltaMs: 22,
      maxDeltaMs: 9.9,
      callbackDelay: { p95: 23.9, max: 27.9 },
      hiddenOverruns: 50,
    },
    scheduledP95: 16.8,
  },
  {
    targetId: 'ipad-device-web',
    label: 'change ink color',
    frameStamps: {
      frames: 303,
      actual: { p50: 8, p95: 9, max: 12 },
      p95DeltaMs: 0,
      maxDeltaMs: -1,
      callbackDelay: { p95: 1, max: 1 },
      hiddenOverruns: 0,
    },
    scheduledP95: 9,
  },
];

function fixture(targetId) {
  return JSON.parse(readFileSync(join(fixtureDirectory, `${targetId}.json`), 'utf8'));
}

function manifestFor(targetId, source, capturePath = join(fixtureDirectory, `${targetId}.json`)) {
  const modes = ['PORTRAIT', 'LANDSCAPE'].flatMap((orientation) =>
    ['light', 'dark'].map((theme) => {
      const selected = orientation === source.orientation && theme === source.theme;
      return selected
        ? {
            orientation,
            theme,
            status: 'captured',
            drawingProductCommit: '3453f1f28b2f7b23560414700ebad04201d9c3af',
            drawing: {},
            actionSources: [
              {
                source: capturePath,
                productCommit: '3453f1f28b2f7b23560414700ebad04201d9c3af',
                kind: 'full',
              },
            ],
          }
        : { orientation, theme, status: 'unavailable', reason: 'Fixture slice.' };
    })
  );
  return {
    schemaVersion: 3,
    recordedOn: '2026-09-19',
    productCommit: '3453f1f28b2f7b23560414700ebad04201d9c3af',
    targets: [
      {
        id: targetId,
        number: 1,
        label: targetId,
        platform: 'test',
        deviceKind: 'physical',
        runtime: 'web',
        environment: 'sanitized fixture',
        fidelity: 'synthetic-advisory',
        modes,
      },
    ],
  };
}

function matrixFor(targetId, source, capturePath) {
  return normalizeMatrix(manifestFor(targetId, source, capturePath));
}

describe('epoch-2 frame stamps in the performance matrix', () => {
  it.each(cases)('publishes $targetId $label as informational evidence', (sample) => {
    const capture = fixture(sample.targetId);
    const original = summarizeActions(capture.samples).find(
      (entry) => entry.label === sample.label
    );
    const matrix = matrixFor(sample.targetId, capture);
    const result = matrix.targets[0].modes.find((mode) => mode.actions)?.actions.results[0];
    const html = renderReport(matrix);

    expect(original.frameStamps).toEqual(sample.frameStamps);
    expect(result.postActionFrames.p95).toBe(sample.scheduledP95);
    expect(result.frameStamps).toEqual(original.frameStamps);
    expect(result.passed).toBe(original.passed);
    expect(html).toContain(
      `hidden overruns ${sample.frameStamps.hiddenOverruns}/${sample.frameStamps.frames}`
    );
    expect(html).toContain(`actual P95 ${sample.frameStamps.actual.p95} ms`);
    expect(html).toContain('informational');
  });

  it('generates JSON, Markdown, and HTML from an epoch-2 capture slice', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-dual-frame-matrix-'));
    const manifestPath = join(directory, 'sources.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(manifestFor('android-device-web', fixture('android-device-web')))
    );

    try {
      await generateDeploymentMatrixReport(manifestPath, { strict: false });
      const data = JSON.parse(readFileSync(join(directory, 'data.json'), 'utf8'));
      const result = data.targets[0].modes.find((mode) => mode.actions)?.actions.results[0];
      const markdown = readFileSync(join(directory, 'index.md'), 'utf8');
      const html = readFileSync(join(directory, 'index.html'), 'utf8');

      expect(result.frameStamps).toEqual(cases[0].frameStamps);
      expect(markdown).toContain('## Discrete actions');
      expect(markdown).toContain('16.8 / 33.4');
      expect(html).toContain('hidden overruns 50/380 scored frames');
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('leaves epoch-1 action cells without a divergence claim', () => {
    const capture = fixture('android-device-web');
    capture.frameStampEpoch = 1;
    capture.samples = capture.samples.map((sample) => ({
      ...sample,
      frameStampEpoch: 1,
      postActionFrames: sample.postActionFrames.map(
        ({ actualGapMs: _actualGapMs, ranFromActionMs: _ranFromActionMs, ...frame }) => frame
      ),
    }));
    const directory = mkdtempSync(join(tmpdir(), 'splotch-legacy-frame-stamps-'));
    const capturePath = join(directory, 'actions.json');
    writeFileSync(capturePath, JSON.stringify(capture));
    const legacy = summarizeActions(capture.samples)[0];
    const matrix = matrixFor('android-device-web', capture, capturePath);
    const result = matrix.targets[0].modes.find((mode) => mode.actions)?.actions.results[0];
    const html = renderReport(matrix);
    rmSync(directory, { recursive: true });

    expect(legacy).not.toHaveProperty('frameStamps');
    expect(result).not.toHaveProperty('frameStamps');
    expect(html).not.toContain('frame stamps (informational)');
    expect(legacy.passed).toBe(summarizeActions(fixture('android-device-web').samples)[0].passed);
  });
});
