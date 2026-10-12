// @vitest-environment node
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import SliderRow from './SliderRow.svelte';

type SliderRowProps = ComponentProps<typeof SliderRow>;

function servedMarkup(value: number) {
  return render(SliderRow, {
    props: { id: 'volume', label: 'Volume', value, onInput: () => {} },
  }).body;
}

describe('SliderRow props', () => {
  it('takes no value-text override, which no setting passes', () => {
    expectTypeOf<SliderRowProps>().not.toHaveProperty('valueText');
  });

  it('shows and announces the value as a percentage', () => {
    const markup = servedMarkup(70);

    expect(markup).toContain('<span>70%</span>');
    expect(markup).toContain('aria-valuetext="70%"');
  });
});
