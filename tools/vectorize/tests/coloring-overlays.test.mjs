import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  checkColoringOverlayLedger,
  coloringOverlayJob,
  coloringOverlayJobs,
  coloringOverlayLedger,
  jobState,
  parseColoringOverlayArgs,
  postprocessArgs,
  selectColoringOverlayJobs,
} from '../vectorize-coloring-overlays.mjs';
import { compareOverlayAlpha, sumWhenComplete } from '../analyze-coloring-overlays.mjs';

describe('coloring overlay campaign', () => {
  it('maps a page outline to the committed overlay and recoverable raw trace', () => {
    const job = coloringOverlayJob(
      'web/static/coloring/creatures/fairy-wide.outline.webp',
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
      'web/static/coloring/creatures/fairy-wide.chalk.webp',
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
        'web/static/coloring/creatures/fairy-wide.outline.webp',
        root
      );
      const second = coloringOverlayJob(
        'web/static/coloring/creatures/owl-wide.outline.webp',
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
        'web/static/coloring/creatures/fairy-wide.chalk.webp',
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
    expect(checkColoringOverlayLedger(coloringOverlayJobs())).toBe(96);
  });

  it('keeps every committed dark SVG tied to its exact chalk source', () => {
    expect(checkColoringOverlayLedger(coloringOverlayJobs(undefined, 'dark'))).toBe(96);
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
});
