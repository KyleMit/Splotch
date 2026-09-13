// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { colorContrast, colorLuminance } from './colorContrast';

describe('colorContrast parses both rgb() notations', () => {
  it.each([
    ['rgb(0 0 0 / 60%)', 'rgba(0, 0, 0, 0.6)'],
    ['rgb(23 23 29 / 72%)', 'rgba(23, 23, 29, 0.72)'],
    ['rgb(255 255 255 / 6%)', 'rgba(255, 255, 255, 0.06)'],
    ['rgb(171 113 225)', 'rgb(171, 113, 225)'],
    ['rgb(0 0 0 / .5)', 'rgba(0, 0, 0, 0.5)'],
  ])('%s matches %s', (modern, legacy) => {
    const contrast = colorContrast(modern, '#fff', '#fff');
    expect(contrast).toBeGreaterThan(0);
    expect(contrast).toBe(colorContrast(legacy, '#fff', '#fff'));
  });

  it.each(['rgb(100% 0% 0%)', 'rgb(0 0)', 'rgb(0 0 0 0 0)', 'rgb(var(--brand-rgb))'])(
    'rejects the unsupported form %s',
    (color) => {
      expect(colorLuminance(color)).toBeNull();
      expect(colorContrast(color, '#fff', '#fff')).toBe(0);
    }
  );
});
