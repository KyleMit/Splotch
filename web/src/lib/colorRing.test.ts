// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getRingColor } from './colorRing';
import { PALETTE_COLORS } from './state/colors.svelte';

describe('getRingColor', () => {
  it('darkens a normal-luminance swatch by ~10%', () => {
    // Purple #AB71E1 → luminance well above 0.2, so each channel ×0.9.
    // 0xAB=171→154 (0x9a), 0x71=113→102 (0x66), 0xE1=225→203 (0xcb)
    expect(getRingColor('#AB71E1')).toBe('#9a66cb');
  });

  it('lightens a very dark swatch instead of darkening it', () => {
    // Black-ish #0a0b10 has luminance < 0.2, so each channel +38.
    // 0x0a=10→48 (0x30), 0x0b=11→49 (0x31), 0x10=16→54 (0x36)
    expect(getRingColor('#0a0b10')).toBe('#303136');
  });

  it('clamps the lighten shift at 255', () => {
    // A dark-but-high-blue color near the ceiling should not overflow past ff.
    expect(getRingColor('#000000')).toBe('#262626'); // 0+38=38=0x26
  });

  it('expands 3-digit shorthand hex', () => {
    // #abc → #aabbcc, luminance high → ×0.9 per channel.
    // 0xaa=170→153(0x99), 0xbb=187→168(0xa8), 0xcc=204→184(0xb8)
    expect(getRingColor('#abc')).toBe('#99a8b8');
  });

  it('tolerates a missing leading hash', () => {
    expect(getRingColor('AB71E1')).toBe('#9a66cb');
  });

  it('always returns a valid 6-digit hex for every palette color', () => {
    for (const { hex } of PALETTE_COLORS) {
      expect(getRingColor(hex)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
