import { expect, it } from 'vitest';
import { RELEASE_HUES, parseReleaseHue } from './releaseHues';
import releases from './releases.json';

it('validates every generated hue against the finite palette vocabulary', () => {
  expect(releases.map((release) => parseReleaseHue(release.hue))).toEqual(
    releases.map((_, index) => RELEASE_HUES[index % RELEASE_HUES.length])
  );
});

it.each(['Yellow', '', null, { hue: 'Purple' }])('rejects an invalid hue %j', (value) => {
  expect(() => parseReleaseHue(value)).toThrow('Unknown release hue');
});
