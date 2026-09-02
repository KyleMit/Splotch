// @vitest-environment node
import { describe, it, expect } from 'vitest';
// The CI raw-hex ratchet (npm run lint:tokens) lives outside web/src; its
// counting logic is the gate's only real logic, so it's pinned here beside
// the token tests. The script's scan-and-exit path only runs when invoked
// directly, so this import is side-effect free.
import {
  countImportant,
  countImportantCss,
  countRawFontSize,
  countRawFontSizeCss,
  countRawHex,
  countRawHexCss,
  countRawZIndex,
  countRawZIndexCss,
} from '../../../../tools/tokens/lint-token-styles.mjs';

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

describe('countRawHexCss', () => {
  it('counts a plain .css source without needing a style tag', () => {
    expect(countRawHexCss('.admin-page { --admin-accent: #7c4dcf; color: #333; }')).toBe(2);
  });

  it('still ignores comments and var() fallbacks', () => {
    expect(countRawHexCss('/* was #999 */ .a { color: var(--text, #333); border: #ddd; }')).toBe(1);
  });
});

describe('countRawZIndexCss', () => {
  it('catches multi-digit literals in a plain .css source', () => {
    expect(countRawZIndexCss('.a { z-index: 900; } .b { z-index: var(--z-panel); }')).toBe(1);
  });
});

describe('countRawZIndex', () => {
  it('catches multi-digit literals', () => {
    expect(countRawZIndex('<style>.a { z-index: 10; } .b { z-index: 100; }</style>')).toBe(2);
  });

  it('allows single-digit literals, including negative', () => {
    expect(countRawZIndex('<style>.a { z-index: 3; } .b { z-index: -1; }</style>')).toBe(0);
  });

  it('allows var(--z-*) usages', () => {
    expect(countRawZIndex('<style>.a { z-index: var(--z-panel); }</style>')).toBe(0);
  });

  it('ignores values in CSS comments', () => {
    expect(countRawZIndex('<style>/* was z-index: 900 */ .a { z-index: 1; }</style>')).toBe(0);
  });

  it('ignores markup outside style blocks', () => {
    expect(countRawZIndex('<div style="z-index: 40"></div>')).toBe(0);
  });
});

describe('countRawFontSize', () => {
  it('counts raw declarations in any unit but not tokenized ones', () => {
    const source = `<style>
  .a { font-size: 10px; }
  .b { font-size: 0.9em; }
  .c { font-size: var(--font-size-sm); }
</style>`;
    expect(countRawFontSize(source)).toBe(2);
  });

  it('does not backtrack past the colon into counting a tokenized declaration', () => {
    expect(countRawFontSize('<style>.a { font-size: var(--font-size-xs); }</style>')).toBe(0);
    expect(countRawFontSize('<style>.a { font-size:var(--font-size-xs); }</style>')).toBe(0);
  });

  it('ignores custom-property declarations and references', () => {
    const source = `<style>
  .a { --admin-font-size: 14px; font-size: var(--admin-font-size); }
</style>`;
    expect(countRawFontSize(source)).toBe(0);
  });

  it('ignores values in CSS comments and markup outside style blocks', () => {
    expect(countRawFontSize('<style>/* was font-size: 13px */ .a { color: red; }</style>')).toBe(0);
    expect(countRawFontSize('<div style="font-size: 40px"></div>')).toBe(0);
  });

  it('catches a size-bearing font shorthand but allows keyword-only forms', () => {
    expect(countRawFontSize('<style>.a { font: 18px sans-serif; }</style>')).toBe(1);
    expect(countRawFontSize('<style>.a { font: bold 18px/1.4 sans-serif; }</style>')).toBe(1);
    expect(countRawFontSize('<style>.a { font: inherit; } .b { font: unset; }</style>')).toBe(0);
    expect(countRawFontSize('<style>.a { font: var(--body-font); }</style>')).toBe(0);
  });

  it('does not mistake longhand font-* properties for the shorthand', () => {
    expect(countRawFontSize('<style>.a { font-family: inherit; font-weight: 700; }</style>')).toBe(
      0
    );
  });

  it('matches property names case-insensitively', () => {
    expect(countRawFontSize('<style>.a { FONT-SIZE: 13px; }</style>')).toBe(1);
    expect(countRawFontSize('<style>.a { Font: inherit; }</style>')).toBe(0);
    expect(countRawFontSize('<style>.a { Font: 18px sans-serif; }</style>')).toBe(1);
  });
});

describe('countRawFontSizeCss', () => {
  it('counts a plain .css source without needing a style tag', () => {
    expect(
      countRawFontSizeCss('.a { font-size: 13px; } .b { font-size: var(--font-size-sm); }')
    ).toBe(1);
  });
});

describe('countImportant', () => {
  it('counts !important only inside <style> blocks', () => {
    const source = `<script>const s = 'very !important string';</script>
<style>.a { color: red !important; } .b { color: blue; }</style>`;
    expect(countImportant(source)).toBe(1);
  });

  it('ignores mentions in CSS comments', () => {
    expect(countImportant('<style>/* never use !important */ .a { color: red; }</style>')).toBe(0);
  });

  it('matches the case-insensitive, whitespace-tolerant grammar', () => {
    expect(countImportant('<style>.a { color: red ! IMPORTANT; }</style>')).toBe(1);
  });
});

describe('countImportantCss', () => {
  it('counts a plain .css source without needing a style tag', () => {
    expect(countImportantCss('.a { display: none !important; } .b { color: red; }')).toBe(1);
  });
});
