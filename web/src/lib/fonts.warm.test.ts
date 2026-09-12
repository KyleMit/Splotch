import { afterEach, describe, expect, it, vi } from 'vitest';

const idle = vi.hoisted(() => ({ queued: [] as Array<() => void>, cancels: 0 }));

vi.mock('./idle', () => ({
  scheduleIdle: (fn: () => void) => {
    idle.queued.push(fn);
    return () => {
      idle.cancels++;
    };
  },
}));

import { QUICKSAND_FONT_FAMILY, warmDisplayFont } from './fonts';

function runIdle() {
  for (const fn of idle.queued.splice(0)) fn();
}

afterEach(() => {
  idle.queued.length = 0;
  idle.cancels = 0;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'connection');
});

describe('warmDisplayFont', () => {
  it('waits for an idle slot instead of fetching at mount', () => {
    const load = vi.fn(async () => []);
    vi.stubGlobal('document', { fonts: { load } });

    warmDisplayFont();

    // Nothing fetched yet: the point is to stay out of the boot window.
    expect(load).not.toHaveBeenCalled();

    runIdle();
    expect(load).toHaveBeenCalledWith(`1em "${QUICKSAND_FONT_FAMILY}"`);
  });

  it('returns the canceller so an early unmount drops the queued work', () => {
    vi.stubGlobal('document', { fonts: { load: vi.fn(async () => []) } });

    warmDisplayFont()();

    expect(idle.cancels).toBe(1);
  });

  // Matches the offline install in pwa/updates.ts, which declines for the same
  // reason. @font-face still fetches the font when a dialog paints text.
  it('skips the warm under Save-Data', () => {
    const load = vi.fn(async () => []);
    vi.stubGlobal('document', { fonts: { load } });
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });

    warmDisplayFont();
    runIdle();

    expect(load).not.toHaveBeenCalled();
  });

  it('does nothing where the Font Loading API is absent', () => {
    vi.stubGlobal('document', {});

    warmDisplayFont();

    expect(runIdle).not.toThrow();
  });
});
