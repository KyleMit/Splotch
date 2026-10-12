import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  checkColoringOverlayLedger,
  coloringOverlayJob,
  coloringOverlayLedger,
  jobState,
  parseColoringOverlayArgs,
  postprocessArgs,
  selectColoringOverlayJobs,
} from '../vectorize-coloring-overlays.mjs';
import {
  analysisPaths,
  compareOverlayAlpha,
  parseAnalysisArgs,
  sumWhenComplete,
} from '../analyze-coloring-overlays.mjs';

describe('coloring overlay campaign', () => {
  it('maps a page outline to the committed overlay and recoverable raw trace', () => {
    const job = coloringOverlayJob(
      'vectorized/coloring-overlays/creatures/fairy-wide.source.webp',
      '/repo'
    );

    expect(job).toMatchObject({
      book: 'creatures',
      stem: 'fairy-wide',
      output: 'web/static/coloring/creatures/fairy-wide.overlay.svg',
      raw: 'vectorized/coloring-overlays/creatures/fairy-wide.raw.svg',
    });
  });

  it('maps chalk art to a white dark-overlay derivative in an independent restart tree', () => {
    const job = coloringOverlayJob(
      'vectorized/coloring-dark-overlays/creatures/fairy-wide.source.webp',
      '/repo',
      'dark'
    );

    expect(job).toMatchObject({
      theme: 'dark',
      output: 'web/static/coloring/creatures/fairy-wide.dark.overlay.svg',
      raw: 'vectorized/coloring-dark-overlays/creatures/fairy-wide.raw.svg',
    });
    expect(postprocessArgs(job).slice(-2)).toEqual(['--fill', '#fff']);
  });

  it('resumes a paid raw response through free post-processing before tracing more', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-vectorize-coloring-'));
    try {
      const first = coloringOverlayJob(
        'vectorized/coloring-overlays/creatures/fairy-wide.source.webp',
        root
      );
      const second = coloringOverlayJob(
        'vectorized/coloring-overlays/creatures/owl-wide.source.webp',
        root
      );
      mkdirSync(join(root, 'vectorized/coloring-overlays/creatures'), { recursive: true });
      writeFileSync(first.rawPath, '<svg/>');

      expect(jobState(first)).toBe('postprocess');
      expect(selectColoringOverlayJobs([first, second], { batchSize: 2 })).toMatchObject([
        { stem: 'fairy-wide', state: 'postprocess' },
        { stem: 'owl-wide', state: 'trace' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an incomplete dark ledger', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-vectorize-coloring-'));
    try {
      const job = coloringOverlayJob(
        'vectorized/coloring-dark-overlays/creatures/fairy-wide.source.webp',
        root,
        'dark'
      );
      expect(() => coloringOverlayLedger([job])).toThrow('1 overlay(s) are missing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('bounds every production run by payload and batch size', () => {
    expect(() => parseColoringOverlayArgs(['--production', '--batch-size', '4'])).toThrow(
      '--production requires --book or --match'
    );
    expect(() => parseColoringOverlayArgs(['--production', '--book', 'farm'])).toThrow(
      '--production requires an explicit --batch-size'
    );
    expect(() =>
      parseColoringOverlayArgs(['--production', '--book', 'farm', '--batch-size', '13'])
    ).toThrow('cannot exceed 12');
  });

  it('requires production mode for an intentional re-trace', () => {
    expect(() => parseColoringOverlayArgs(['--force', '--book', 'farm'])).toThrow(
      '--force requires --production'
    );
  });

  it('closes the campaign theme vocabulary', () => {
    expect(() => parseColoringOverlayArgs(['--theme', 'sepia'])).toThrow(
      '--theme must be light or dark'
    );
  });

  it('keeps every committed light SVG tied to its exact authoring outline', () => {
    expect(checkColoringOverlayLedger('light')).toBe(104);
  });

  it('keeps every committed dark SVG tied to its exact chalk source', () => {
    expect(checkColoringOverlayLedger('dark')).toBe(104);
  });

  it('verifies available trace sources without requiring recovery scratch', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-vectorize-coloring-'));
    try {
      const job = coloringOverlayJob(
        'vectorized/coloring-overlays/farm/cat-tall.source.webp',
        root
      );
      mkdirSync(join(root, 'vectorized/coloring-overlays/farm'), { recursive: true });
      mkdirSync(join(root, 'web/static/coloring/farm'), { recursive: true });
      mkdirSync(join(root, 'tools/vectorize'), { recursive: true });
      writeFileSync(job.sourcePath, 'approved trace source');
      writeFileSync(job.outputPath, '<svg/>');
      const ledger = coloringOverlayLedger([job], null, root);
      writeFileSync(
        join(root, 'tools/vectorize/coloring-overlays.json'),
        `${JSON.stringify(ledger, null, 2)}\n`
      );

      expect(checkColoringOverlayLedger('light', root)).toBe(1);
      rmSync(job.sourcePath);
      expect(checkColoringOverlayLedger('light', root)).toBe(1);
      writeFileSync(job.sourcePath, 'different trace source');
      expect(() => checkColoringOverlayLedger('light', root)).toThrow(
        'Canonical coloring SVG inventory or bytes drifted'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('measures alpha fidelity independently from vector fill color', () => {
    expect(compareOverlayAlpha(Uint8Array.from([0, 255]), Uint8Array.from([0, 255]))).toEqual({
      meanAbsoluteError: 0,
      binaryPrecision: 1,
      binaryRecall: 1,
      binaryIou: 1,
    });
  });

  it('reports unavailable raster comparison totals as null', () => {
    expect(sumWhenComplete([{ bytes: 1 }, { bytes: null }], (row) => row.bytes)).toBeNull();
    expect(sumWhenComplete([{ bytes: 1 }, { bytes: 2 }], (row) => row.bytes)).toBe(3);
  });

  it('reads fidelity references from the restart-safe campaign source tree', () => {
    expect(analysisPaths('web/static/coloring/farm/cover.dark.overlay.svg', 'dark')).toMatchObject({
      source: 'vectorized/coloring-dark-overlays/farm/cover.source.webp',
    });
  });

  it('accepts the campaign match filter for focused analysis', () => {
    expect(parseAnalysisArgs(['--theme=dark', '--match=cover'])).toEqual({
      theme: 'dark',
      match: 'cover',
    });
  });
});
