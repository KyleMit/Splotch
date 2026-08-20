import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkColoringOverlayLedger,
  coloringOverlayJob,
  coloringOverlayJobs,
  jobState,
  parseColoringOverlayArgs,
  selectColoringOverlayJobs,
} from '../vectorize-coloring-overlays.mjs';
import { compareOverlayAlpha } from '../analyze-coloring-overlays.mjs';

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

  it('resumes a paid raw response through free post-processing before tracing more', () => {
    const root = join('/tmp', `vectorize-coloring-${process.pid}-${Date.now()}`);
    const first = coloringOverlayJob('web/static/coloring/creatures/fairy-wide.outline.webp', root);
    const second = coloringOverlayJob('web/static/coloring/creatures/owl-wide.outline.webp', root);
    mkdirSync(join(root, 'vectorized/coloring-overlays/creatures'), { recursive: true });
    writeFileSync(first.rawPath, '<svg/>');

    expect(jobState(first)).toBe('postprocess');
    expect(selectColoringOverlayJobs([first, second], { batchSize: 2 })).toMatchObject([
      { stem: 'fairy-wide', state: 'postprocess' },
      { stem: 'owl-wide', state: 'trace' },
    ]);
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

  it('keeps every committed light SVG tied to its exact authoring outline', () => {
    expect(checkColoringOverlayLedger(coloringOverlayJobs())).toBe(96);
  });

  it('measures alpha fidelity independently from vector fill color', () => {
    expect(compareOverlayAlpha(Uint8Array.from([0, 255]), Uint8Array.from([0, 255]))).toEqual({
      meanAbsoluteError: 0,
      binaryPrecision: 1,
      binaryRecall: 1,
      binaryIou: 1,
    });
  });
});
