import { describe, expect, it, vi } from 'vitest';
import { runBootScript } from './appHtmlBootTestHarness';
import {
  EXPLICIT_REDUCE_MOTION_PREFERENCES,
  REDUCE_MOTION_ATTRIBUTE,
  REDUCE_MOTION_DEFAULT,
  REDUCED_MOTION_QUERY,
  resolveReducedMotion,
} from './lib/platform/reducedMotion';
import { STORAGE_KEYS } from './lib/storage';

// Every reduced-motion CSS treatment keys off the attribute this stamps, so the
// script carries its own copy of the storage key, the attribute name, the query
// and resolveReducedMotion's three-state rule. Running it against the module's
// exports fails on a drift in any of the four.
describe("app.html's boot script stamps reduce-motion like the platform module", () => {
  function boot(stored: string | null, systemReduce: boolean) {
    localStorage.clear();
    if (stored !== null) localStorage.setItem(STORAGE_KEYS.reduceMotion, stored);
    document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE);

    const os = { reduce: systemReduce };
    const osListeners: (() => void)[] = [];
    window.matchMedia = ((query: string) => ({
      get matches() {
        return query === REDUCED_MOTION_QUERY && os.reduce;
      },
      addEventListener: (_type: string, listener: () => void) => {
        if (query === REDUCED_MOTION_QUERY) osListeners.push(listener);
      },
    })) as unknown as typeof window.matchMedia;

    runBootScript();

    return {
      stamped: () => document.documentElement.hasAttribute(REDUCE_MOTION_ATTRIBUTE),
      switchOs(reduce: boolean) {
        os.reduce = reduce;
        for (const listener of osListeners) listener();
      },
    };
  }

  for (const preference of [...EXPLICIT_REDUCE_MOTION_PREFERENCES, REDUCE_MOTION_DEFAULT]) {
    for (const systemReduce of [false, true]) {
      it(`${preference} preference with the OS at ${systemReduce ? 'reduce' : 'no-preference'}`, () => {
        const stored = preference === REDUCE_MOTION_DEFAULT ? null : preference;
        expect(boot(stored, systemReduce).stamped()).toBe(
          resolveReducedMotion(preference, systemReduce)
        );
      });
    }
  }

  it('treats an unrecognized stored value as the default, as readReduceMotion does', () => {
    expect(boot('sometimes', true).stamped()).toBe(
      resolveReducedMotion(REDUCE_MOTION_DEFAULT, true)
    );
  });

  it('follows a later OS switch in system mode', () => {
    const session = boot(null, false);
    session.switchOs(true);
    expect(session.stamped()).toBe(true);
    session.switchOs(false);
    expect(session.stamped()).toBe(false);
  });

  // The listener re-reads storage, so a preference Settings wrote after boot
  // still overrides the OS on a route with no appearance state.
  it('resolves a later OS switch against the preference stored by then', () => {
    const session = boot(null, false);
    localStorage.setItem(STORAGE_KEYS.reduceMotion, 'full');
    session.switchOs(true);
    expect(session.stamped()).toBe(false);
  });

  it('stamps the OS answer when storage refuses every read', () => {
    const refusedRead = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    try {
      expect(boot(null, true).stamped()).toBe(true);
    } finally {
      refusedRead.mockRestore();
    }
  });
});
