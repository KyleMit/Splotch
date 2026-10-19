import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZE,
  ERASER_SIZE_MULTIPLIER,
  STROKE_SIZES,
  getEraserWidthPx,
  getStrokeWidthPx,
} from '../../web/src/lib/drawing/strokeSettings.ts';
import {
  DEFAULT_STROKE_WIDTH,
  STROKE_WIDTHS,
  strokeWidthPx,
} from '../../experiments/native-architecture/src/drawing/strokeWidth.ts';
import { BRUSHES } from '../../experiments/native-architecture/src/drawing/brushes.ts';

// Native names shipping's five numbered stroke levels; the width at index i is level i + 1.
const level = (width) => STROKE_SIZES[STROKE_WIDTHS.indexOf(width)];
const INK_BRUSHES = ['pen', 'crayon', 'magic'];

describe('native stroke widths against strokeSettings.ts', () => {
  it('names exactly one width for each shipping level', () => {
    expect(STROKE_WIDTHS.map(level)).toEqual([...STROKE_SIZES]);
  });

  it('starts on the shipping default level', () => {
    expect(level(DEFAULT_STROKE_WIDTH)).toBe(DEFAULT_SIZE);
    for (const brush of INK_BRUSHES)
      expect(BRUSHES[brush].width, brush).toBe(getStrokeWidthPx(DEFAULT_SIZE));
    expect(BRUSHES.eraser.width).toBe(getEraserWidthPx(DEFAULT_SIZE));
  });

  it.each(INK_BRUSHES)('sizes %s ink at the shipping width for every level', (brush) => {
    for (const width of STROKE_WIDTHS)
      expect(strokeWidthPx(brush, width), width).toBe(getStrokeWidthPx(level(width)));
  });

  it('sizes the eraser at the shipping multiple of the ink width for every level', () => {
    for (const width of STROKE_WIDTHS) {
      expect(strokeWidthPx('eraser', width), width).toBe(getEraserWidthPx(level(width)));
      expect(strokeWidthPx('eraser', width) / strokeWidthPx('pen', width)).toBe(
        ERASER_SIZE_MULTIPLIER
      );
    }
  });
});
