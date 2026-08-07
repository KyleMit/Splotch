import { describe, expect, it } from 'vitest';
import {
  adminConsoleSentinels,
  FORBIDDEN_NATIVE_HOSTS,
  nativeBundleProblems,
} from '../check-native-bundle.mjs';

// The guard's failure mode is silence: if its sentinels stop matching anything
// the console actually ships, `build:cap` stays green while the console returns
// to the bundle. These lock the derivation rather than the strings.

describe('admin console sentinels', () => {
  it('derives the shipped placeholders from the component source', () => {
    const sentinels = adminConsoleSentinels();
    expect(sentinels.length).toBeGreaterThan(0);
    expect(sentinels).toContain('Admin access key');
  });

  it('deduplicates repeated placeholders', () => {
    expect(adminConsoleSentinels('placeholder="Same" placeholder="Same"')).toEqual(['Same']);
  });

  it('skips interpolated placeholders, which do not survive minification verbatim', () => {
    expect(adminConsoleSentinels('placeholder="Literal" placeholder="{dynamic}"')).toEqual([
      'Literal',
    ]);
  });

  it('throws rather than passing vacuously when the component has no placeholders', () => {
    expect(() => adminConsoleSentinels('<p>no inputs here</p>')).toThrow(/vacuously/);
  });
});

describe('native bundle scan', () => {
  it('reports a missing build directory instead of reporting success', () => {
    expect(nativeBundleProblems('/nonexistent/build', ['x'])[0]).toMatch(/does not exist/);
  });

  it('scans for Play hosts by host, not by fully composed URL', () => {
    // The bundler keeps the route's URL constants as template literals with the
    // app id interpolated, so a whole-URL match would miss the real regression.
    expect(FORBIDDEN_NATIVE_HOSTS).toContain('play.google.com');
    for (const host of FORBIDDEN_NATIVE_HOSTS) expect(host).not.toContain('/');
  });
});
