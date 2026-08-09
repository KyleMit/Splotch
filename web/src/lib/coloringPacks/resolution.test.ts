// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { coloringPackResolutionForScreen } from './resolution';

describe('coloringPackResolutionForScreen', () => {
  it.each([
    [{ widthCssPx: 375, heightCssPx: 667, devicePixelRatio: 2 }, 'compact'],
    [{ widthCssPx: 393, heightCssPx: 852, devicePixelRatio: 2 }, 'full'],
    [{ widthCssPx: 375, heightCssPx: 667, devicePixelRatio: 3 }, 'full'],
    [{ widthCssPx: 430, heightCssPx: 932, devicePixelRatio: 3 }, 'full'],
    [{ widthCssPx: 768, heightCssPx: 1024, devicePixelRatio: 1 }, 'compact'],
    [{ widthCssPx: 768, heightCssPx: 1024, devicePixelRatio: 2 }, 'full'],
    [{ widthCssPx: 1366, heightCssPx: 1024, devicePixelRatio: 2 }, 'full'],
  ] as const)('selects the screen-sized pack for %o', (screen, expected) => {
    expect(coloringPackResolutionForScreen(screen)).toBe(expected);
  });

  it('is orientation-independent', () => {
    const portrait = { widthCssPx: 375, heightCssPx: 667, devicePixelRatio: 2 };
    expect(coloringPackResolutionForScreen(portrait)).toBe(
      coloringPackResolutionForScreen({
        ...portrait,
        widthCssPx: portrait.heightCssPx,
        heightCssPx: portrait.widthCssPx,
      })
    );
  });

  it('keeps full resolution when screen metrics are unavailable', () => {
    expect(
      coloringPackResolutionForScreen({
        widthCssPx: 0,
        heightCssPx: 0,
        devicePixelRatio: 0,
      })
    ).toBe('full');
  });
});
