import { describe, expect, it } from 'vitest';

import { roundCoordinate, transformPathData } from '../lib/svg-path-transform.mjs';

// These cases were previously reachable only through rebase-icon-viewbox's
// whole-file rasterization gate, which reports "more than antialiasing differs"
// rather than which command was mapped wrong. Asserting the path data directly
// names the rule each case protects.
const transform = (d, options = {}) =>
  transformPathData(d, { scale: 2, translateX: 10, translateY: 20, ...options });

describe('transformPathData', () => {
  it('scales and translates absolute commands, and only scales relative ones', () => {
    expect(transform('M 1 2 L 3 4')).toBe('M12 24L16 28');
    expect(transform('m 1 2 l 3 4')).toBe('m12 24l6 8');
  });

  // The one rule in here that is not mechanical: a path's opening pair is in
  // user space whatever case it is written in, so it takes the translate. Every
  // later `m` is a genuine relative move and must not.
  it('treats only the opening moveto as absolute when written lowercase', () => {
    expect(transform('M1 2m3 4')).toBe('M12 24m6 8');
    expect(transform('m1 2m3 4')).toBe('m12 24m6 8');
  });

  it('scales arc radii and passes the rotation and both flags through untouched', () => {
    // A uniform scale cannot change which arc sweep is chosen, so large-arc and
    // sweep are not numbers to map — re-emitting them as coordinates would flip
    // the curve.
    expect(transform('M 0 0 A 3 4 45 1 0 7 8')).toBe('M10 20A6 8 45 1 0 24 36');
    expect(transform('M 0 0 a 3 4 45 1 0 7 8')).toBe('M10 20a6 8 45 1 0 14 16');
  });

  it('moves H on x and V on y alone', () => {
    expect(transform('M 0 0 H 5 V 6 h 5 v 6')).toBe('M10 20H20V32h10v12');
  });

  it('maps every pair of an implicit coordinate run, not just the first', () => {
    expect(transform('M 0 0 L 1 2 3 4 5 6')).toBe('M10 20L12 24 16 28 20 32');
  });

  it('carries a closepath through without arguments', () => {
    expect(transform('M 0 0 Z')).toBe('M10 20Z');
  });

  it('reads exponent and leading-dot number forms', () => {
    expect(transform('M .5 1e2 L 1.5e1 .25')).toBe('M11 220L40 20.5');
  });

  it('normalizes negative zero, which renders as a stray minus sign', () => {
    expect(transform('M -0.001 -0.001', { scale: 1, translateX: 0, translateY: 0 })).toBe('M0 0');
    expect(Object.is(roundCoordinate(-0.001), 0)).toBe(true);
  });

  it('is an identity mapping at scale 1 with no offset', () => {
    expect(transform('M10 20C30 40 50 60 70 80Z', { scale: 1, translateX: 0, translateY: 0 })).toBe(
      'M10 20C30 40 50 60 70 80Z'
    );
  });

  // The failure this guards is silent: a token the regex does not recognise is
  // dropped, and the path still parses into something plausible.
  it('rejects path data it cannot fully account for instead of dropping tokens', () => {
    expect(() => transform('M 1 2 ! 3')).toThrow(/dropped characters/);
    expect(() => transform('1 2 L 3 4')).toThrow(/starts without a command/);
    expect(() => transform('M 1 2 Q 3 4')).toThrow(/bad args for Q/);
  });

  // A closepath consumes no tokens, so a number after one used to re-enter the
  // loop without advancing and spin forever — a malformed imported icon could
  // hang the rebase command with no output. Rejecting is the fail-loudly
  // contract the rest of this module already keeps.
  it('rejects arguments after a closepath rather than looping on them', () => {
    expect(() => transform('M0 0Z1 2')).toThrow(/closepath takes no arguments/);
    expect(() => transform('M0 0z1 2')).toThrow(/closepath takes no arguments/);
    expect(transform('M0 0ZM1 1Z')).toBe('M10 20ZM12 22Z');
  });
});
