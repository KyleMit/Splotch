import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Slider from './Slider.svelte';

const POINTER_ID = 1;

let mounted: ReturnType<typeof mount> | null = null;

function mountSlider() {
  const onInput = vi.fn();
  const onActiveChange = vi.fn();
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(Slider, {
    target,
    props: { value: 50, labelId: 'label', valueText: '50%', onInput, onActiveChange },
  });
  flushSync();
  const slider = target.querySelector('[role="slider"]');
  if (!slider) throw new Error('Slider did not render');
  return { slider, onInput, onActiveChange };
}

function dragFrom(slider: Element, button: number) {
  const init = { pointerId: POINTER_ID, isPrimary: true, bubbles: true, cancelable: true };
  const down = new PointerEvent('pointerdown', { ...init, button, clientX: 0 });
  slider.dispatchEvent(down);
  window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 40 }));
  window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 40 }));
  return down;
}

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
});

describe('Slider pointer drag', () => {
  it('drags the value with the primary button', () => {
    const { slider, onInput, onActiveChange } = mountSlider();

    const down = dragFrom(slider, 0);

    expect(down.defaultPrevented).toBe(true);
    expect(onInput).toHaveBeenCalled();
    expect(onActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it.each([
    ['middle', 1],
    ['right', 2],
  ])('ignores a %s-button drag', (_, button) => {
    const { slider, onInput, onActiveChange } = mountSlider();

    const down = dragFrom(slider, button);

    expect(down.defaultPrevented).toBe(false);
    expect(onInput).not.toHaveBeenCalled();
    expect(onActiveChange).not.toHaveBeenCalled();
  });
});
