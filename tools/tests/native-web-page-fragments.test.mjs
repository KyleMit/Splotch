import { describe, expect, it } from 'vitest';
import {
  canonicalFragmentCss,
  canonicalFragmentMarkup,
  canonicalFragments,
  withVariantFragments,
} from '../migration/page-fragments.mjs';

describe("each variant's fragments", () => {
  it('keys only the ids an in-page link targets, and those links', () => {
    expect(
      withVariantFragments(
        '<a href="#counting">x</a><a href="#gone">y</a><section id="counting"></section><p id="«r0»"></p>',
        'phone-light'
      )
    ).toBe(
      '<a href="#counting~phone-light">x</a><a href="#gone">y</a><section id="counting~phone-light"></section><p id="«r0»"></p>'
    );
  });
});

describe('the canonical section targets', () => {
  it("gives each canonical target its section's scroll margin and nothing else", () => {
    expect(
      canonicalFragments(
        '<a href="#dottie">Dottie</a><section class="xflex xmargin xwide" id="dottie"></section>',
        '.xflex{display:flex}.xmargin{scroll-margin-top:40px}@media (min-width: 980px){.xwide.xwide{scroll-margin-top:var(--s4)}}'
      )
    ).toEqual([{ id: 'dottie', classes: ['xmargin', 'xwide'] }]);
  });

  it('adds no markup or styles for a page without section links', () => {
    expect(canonicalFragmentMarkup([])).toEqual([]);
    expect(canonicalFragmentCss([], 'data-page-variant')).toBe('');
  });

  it('hides the targets from an engine without anchor positioning', () => {
    const css = canonicalFragmentCss([{ id: 'contact', classes: [] }], 'data-page-variant');
    expect(css.startsWith('[data-page-fragment]{display:none}@supports (anchor-name:--f){')).toBe(
      true
    );
    expect(css.endsWith('}')).toBe(true);
  });
});
