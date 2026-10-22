import { describe, expect, it, vi } from 'vitest';
import { scale } from '../../../web/src/lib/design/tokens.ts';
import {
  CSS_EASE,
  CSS_EASE_REVERSED,
  EASE_GLIDE,
  MODAL_EXIT_MS,
  MODAL_FADE_MS,
  MODAL_GUTTER_MIN_PX,
  modalFrame,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import { blobPath } from '../../../experiments/native-architecture/src/rsdDrawing/blob.ts';

vi.mock('react-strict-dom', () => ({
  css: { defineVars: (vars) => vars, createTheme: (_vars, overrides) => overrides },
}));

const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const GUTTER = MODAL_GUTTER_MIN_PX;

describe('the shipping modal frame', () => {
  it('flies in along dialogFlyFromOrigin and back along dialogFlyBack', () => {
    expect(scale.durationBase).toBe(`${MODAL_FADE_MS / 1000}s`);
    expect(scale.durationExit).toBe(`${MODAL_EXIT_MS / 1000}s`);
    expect(scale.easeGlide).toBe(`cubic-bezier(${EASE_GLIDE.join(', ')})`);
    const [x1, y1, x2, y2] = CSS_EASE;
    expect(CSS_EASE_REVERSED).toEqual([1 - x2, 1 - y2, 1 - x1, 1 - y1]);
  });

  it('caps a short confirmation at the shipping dialog viewport reserve', () => {
    const frame = modalFrame('confirm', PHONE_LANDSCAPE, GUTTER);
    expect(frame).toMatchObject({ width: 336, maxHeight: 352, height: null });
    expect((PHONE_LANDSCAPE.height - frame.maxHeight) / 2).toBe(19);
  });

  it('fits horizontal gutters without reducing the confirmation cap and retains the Settings cap', () => {
    expect.soft(modalFrame('confirm', PHONE, GUTTER).maxHeight).toBe(806);
    expect.soft(modalFrame('confirm', PHONE, 59)).toMatchObject({ width: 272, maxHeight: 806 });
    expect.soft(modalFrame('confirm', PHONE_LANDSCAPE, 24)).toMatchObject({
      width: 336,
      maxHeight: 352,
    });
    expect(modalFrame('settings', PHONE_LANDSCAPE, GUTTER).maxHeight).toBe(331.5);
  });
});

describe('blobPath inset for the outlined close blob', () => {
  it('draws the outline unchanged with no inset', () => {
    expect(blobPath('radiusBlob2', 48, 48, 0)).toBe(blobPath('radiusBlob2', 48, 48));
  });

  it('keeps each corner elliptical from the shipping horizontal and vertical radii', () => {
    const path = blobPath('radiusBlob1', 48, 48);
    expect(path).toMatch(/^M27\.84 0 /);
    expect(path).toContain('A20.16 27.84 0 0 1 48 27.84');
    expect(path).toContain('A27.84 21.6 0 0 1 27.84 0');
  });

  it('moves the outline in by the inset and shrinks every radius by it', () => {
    const path = blobPath('radiusBlob2', 48, 48, 1);
    // The right side's vertical radii (45% + 58%) overrun the height, so every radius first
    // shrinks by 48 / 49.44, as CSS does, then by the 1px inset.
    expect(path).toMatch(/^M20\.971 1 H22\.369 A24\.631 19\.971 0 0 1 47 20\.971 /);
    expect(path).toMatch(/Z$/);
  });
});

describe('modal frame layout contracts', () => {
  it('caps Settings at its phone, landscape-phone and wide shell widths and heights', () => {
    expect(modalFrame('settings', PHONE, GUTTER)).toMatchObject({
      width: 358,
      maxHeight: 844 * 0.85,
      height: null,
    });
    expect(modalFrame('settings', { width: 600, height: 900 }, GUTTER).width).toBe(500);
    expect(modalFrame('sheet', { width: 1366, height: 1024 }, GUTTER).width).toBe(500);
    expect(modalFrame('settings', { width: 1366, height: 1024 }, GUTTER)).toMatchObject({
      width: 860,
      height: 760,
    });
    expect(modalFrame('settings', { width: 800, height: 700 }, GUTTER).height).toBe(700 * 0.85);
    expect(modalFrame('settings', PHONE_LANDSCAPE, GUTTER).width).toBe(640);
  });
  it('pads the Settings header and scroll as the shipping card does on narrow and roomy phones', () => {
    expect(modalFrame('sheet', { width: 600, height: 900 }, GUTTER)).toMatchObject({
      header: { top: 28, inline: 24, bottom: 18 },
      body: { top: 0, inline: 24, bottom: 28 },
    });
    expect(modalFrame('sheet', PHONE, GUTTER)).toMatchObject({
      header: { top: 24, inline: 20, bottom: 16 },
      body: { top: 0, inline: 20, bottom: 24 },
    });
  });
  it.each([
    ['phone', { width: 390, height: 844 }, 336, { top: 24, inline: 24, bottom: 20 }],
    ['landscape phone', { width: 844, height: 390 }, 560, { top: 16, inline: 22, bottom: 16 }],
    ['tablet', { width: 834, height: 1194 }, 420, { top: 24, inline: 32, bottom: 24 }],
    ['large tablet', { width: 1366, height: 1024 }, 480, { top: 32, inline: 40, bottom: 32 }],
  ])('sizes and pads the parental gate as shipping does on a %s', (_, window, width, body) => {
    expect(modalFrame('gate', window, GUTTER)).toMatchObject({ width, body });
  });
  it('sizes and pads the confirm card as shipping does', () => {
    expect(modalFrame('confirm', { width: 1366, height: 1024 }, GUTTER)).toMatchObject({
      width: 336,
      body: { top: 24, inline: 24, bottom: 20 },
    });
  });
});
