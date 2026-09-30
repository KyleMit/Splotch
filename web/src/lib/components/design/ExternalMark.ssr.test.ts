// @vitest-environment node
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ExternalMark from './ExternalMark.svelte';

const VARIANTS = ['inline', 'standalone'] as const;

function renderMark(variant: (typeof VARIANTS)[number]) {
  const { document } = new Window();
  document.body.innerHTML = render(ExternalMark, { props: { variant } }).body;
  const mark = document.querySelector('[data-external-mark]');
  if (!mark) throw new Error('ExternalMark rendered no [data-external-mark] root');
  return mark;
}

const WORD_JOINER = '\u2060';

describe.each(VARIANTS)('ExternalMark %s', (variant) => {
  it('hides the arrow blob from assistive tech', () => {
    const hidden = renderMark(variant).querySelector('[aria-hidden="true"]');

    expect(hidden?.querySelector(`.${variant} [data-icon="external"]`)).not.toBeNull();
  });

  it('binds the blob to the label with a word joiner kept out of the link name', () => {
    const hidden = renderMark(variant).querySelector('[aria-hidden="true"]');

    expect(hidden?.textContent?.startsWith(WORD_JOINER)).toBe(true);
  });

  it('announces that the link leaves Splotch', () => {
    const suffix = renderMark(variant).querySelector('.visually-hidden');

    expect(suffix?.textContent).toBe('(opens outside Splotch)');
  });
});
