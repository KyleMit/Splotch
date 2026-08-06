// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { brand, isColorToken, scale, themes, type ThemeTokens } from '../../design/tokens';
import { CHIP_INK_DARK, CHIP_INK_LIGHT, chipInkContrast, pickChipInk } from './chipInk';

// The /design color chips print each token's var name and value on the
// token's own fill. This locks the WCAG guarantee the chips rely on: for
// every current token value, in both themes, the picked ink clears the 4.5:1
// AA floor — so a future token change can't silently make a chip unreadable
// (the a11y axe scan covers the chips too; this is the faster, exhaustive
// dual-theme check).
const AA_MIN_CONTRAST = 4.5;

const themeNames = ['light', 'dark'] as const;

describe('pickChipInk clears AA on every token fill', () => {
  for (const themeName of themeNames) {
    const theme = themes[themeName];
    const ground = theme.appBg;
    const colorKeys = (Object.keys(theme) as (keyof ThemeTokens)[]).filter(
      (key) => isColorToken[key]
    );

    it.each(colorKeys)(`${themeName} %s`, (key) => {
      const fill = theme[key];
      const ink = pickChipInk([fill], ground);
      expect([CHIP_INK_DARK, CHIP_INK_LIGHT]).toContain(ink);
      expect(chipInkContrast(ink, fill, ground)).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
    });
  }
});

describe('pickChipInk clears AA on the unthemed brand fills', () => {
  const ground = themes.light.appBg;
  const gradientStops = scale.clearGradientRest.match(/#[0-9a-fA-F]{3,8}/g) ?? [];

  it('parses the gradient into its stops', () => {
    expect(gradientStops.length).toBeGreaterThan(1);
  });

  it.each([[brand.brand], [`rgb(${brand.brandRgb})`], [brand.onBrand], gradientStops])(
    '%j',
    (...fills) => {
      const ink = pickChipInk(fills, ground);
      for (const fill of fills) {
        expect(chipInkContrast(ink, fill, ground)).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
      }
    }
  );
});
