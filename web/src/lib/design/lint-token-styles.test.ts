// @vitest-environment node
import { describe, it, expect } from 'vitest';
// The CI raw-hex ratchet (npm run lint:tokens) lives outside web/src; its
// counting logic is the gate's only real logic, so it's pinned here beside
// the token tests. The script's scan-and-exit path only runs when invoked
// directly, so this import is side-effect free.
import { countRawHex } from '../../../../scripts/lint-token-styles.mjs';

describe('countRawHex', () => {
  it('counts hex colors only inside <style> blocks', () => {
    const source = `<script>const c = '#123456';</script>
<div style="color: #abc"></div>
<style>
  .a { color: #ff0000; background: #00ff0080; }
</style>`;
    expect(countRawHex(source)).toBe(2);
  });

  it('ignores hexes in CSS comments', () => {
    expect(countRawHex('<style>/* was #333 then #444 */ .a { color: #555; }</style>')).toBe(1);
  });

  it('ignores hexes in var() fallbacks but counts hexes outside them', () => {
    const source = `<style>
  .a { color: var(--text, #333); border-color: #e0e0e0; }
</style>`;
    expect(countRawHex(source)).toBe(1);
  });

  it('counts every hex in a multi-color gradient', () => {
    expect(
      countRawHex('<style>.r { background: conic-gradient(#ff5e5e, #ffa94d, #ffe066); }</style>')
    ).toBe(3);
  });

  it('sums across multiple style blocks and handles attributes on the tag', () => {
    const source = `<style lang="css">.a { color: #111; }</style>
<p>between</p>
<style>.b { color: #222; }</style>`;
    expect(countRawHex(source)).toBe(2);
  });

  it('returns 0 for a component with no style block', () => {
    expect(countRawHex('<p>hello #333</p>')).toBe(0);
  });
});
