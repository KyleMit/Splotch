import { describe, expect, it } from 'vitest';
import { nativeTapPoint } from '../lib/native-tap-point.mjs';

describe('iPhone native tap placement', () => {
  it('keeps a compact drawer tap above the home-indicator gesture region', () => {
    const bounds = { x: 9, y: 900, width: 48, height: 48 };
    const window = { x: 0, y: 0, width: 440, height: 956 };
    expect(
      nativeTapPoint(
        { platformName: 'iOS', deviceClass: 'handset' },
        bounds,
        'drawer',
        () => null,
        window
      )
    ).toMatchObject({ x: 33, y: 912 });
    expect(
      nativeTapPoint(
        { platformName: 'iOS', deviceClass: 'tablet' },
        bounds,
        'drawer',
        () => null,
        window
      )
    ).toMatchObject({ x: 33, y: 924 });
    expect(
      nativeTapPoint({ platformName: 'Android' }, bounds, 'drawer', () => null, window)
    ).toMatchObject({ x: 33, y: 924 });
  });
});
