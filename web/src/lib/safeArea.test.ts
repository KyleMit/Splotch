import { describe, expect, it, vi } from 'vitest';
import { measureSafeAreaInsets } from './safeArea';

describe('measureSafeAreaInsets', () => {
  it('reuses one retained probe while measuring every inset', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844);
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(3, 47, 376, 763));
    const createElement = vi.spyOn(document, 'createElement');
    const appendChild = vi.spyOn(document.body, 'appendChild');

    const first = measureSafeAreaInsets();
    const probe = document.body.lastElementChild as HTMLDivElement;
    const second = measureSafeAreaInsets();

    expect(first).toEqual({ top: 47, right: 11, bottom: 34, left: 3 });
    expect(second).toEqual(first);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(probe);
    expect(getBoundingClientRect).toHaveBeenCalledTimes(2);
    expect(document.body.lastElementChild).toBe(probe);
    expect(probe).toBeInstanceOf(HTMLDivElement);
    expect(probe.style.position).toBe('fixed');
    expect(probe.style.visibility).toBe('hidden');
    expect(probe.style.pointerEvents).toBe('none');
  });
});
