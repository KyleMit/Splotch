// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { geometryIntersectsTile, tileCssSpan, tilesIntersect } from './tiledGeometry';

const tile = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  paperLeft: 0,
  paperTop: 0,
  paperRight: 100,
  paperBottom: 100,
};

describe('tiled geometry', () => {
  it('includes anti-aliased stroke coverage beyond the geometric radius', () => {
    expect(
      geometryIntersectsTile(
        { kind: 'dot', x: 101.5, y: 50, radius: 1, color: '#000000', erase: false },
        tile
      )
    ).toBe(true);
  });

  it('treats touching tile edges as half-open rather than overlapping', () => {
    expect(tilesIntersect(tile, { ...tile, x: 100, paperLeft: 100, paperRight: 200 })).toBe(false);
  });

  it('places shared CSS edges on physical-device pixels', () => {
    const first = tileCssSpan(0, 4, 375, 3);
    const second = tileCssSpan(1, 4, 375, 3);

    expect((first.start + first.size) * 3).toBe(Math.round((first.start + first.size) * 3));
    expect(first.start + first.size).toBe(second.start);
    const last = tileCssSpan(3, 4, 375.25, 3);
    expect(last.start + last.size).toBe(375.25);
  });
});
