import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from './theme';

const root = document.documentElement;

function stubViewTransition() {
  const start = vi.fn((update: () => void) => {
    update();
    return {} as ViewTransition;
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  return start;
}

describe('applyTheme', () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    root.removeAttribute('data-theme');
    root.removeAttribute('data-reduce-motion');
  });

  it('crossfades a theme change through a view transition', () => {
    const start = stubViewTransition();
    applyTheme('dark');
    expect(start).toHaveBeenCalledOnce();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('starts no transition for a restamp that changes nothing', () => {
    root.setAttribute('data-theme', 'dark');
    const start = stubViewTransition();
    applyTheme('dark');
    root.removeAttribute('data-theme');
    applyTheme('system');
    expect(start).not.toHaveBeenCalled();
  });

  it('swaps at once under reduced motion', () => {
    root.setAttribute('data-reduce-motion', '');
    const start = stubViewTransition();
    applyTheme('light');
    expect(start).not.toHaveBeenCalled();
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('swaps at once where the engine has no view transitions', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
