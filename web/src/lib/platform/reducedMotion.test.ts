import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from './reducedMotion';

// The probe caches its MediaQueryList on first use, so each case imports a
// fresh module instance rather than inheriting the previous case's list.
async function freshProbe() {
  vi.resetModules();
  return (await import('./reducedMotion')).prefersReducedMotion;
}

afterEach(() => vi.unstubAllGlobals());

describe('prefersReducedMotion', () => {
  it('reports the preference the shared query names', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMedia);

    expect(await (await freshProbe())()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });

  it('builds one MediaQueryList however often it is read', async () => {
    const list = { matches: false };
    const matchMedia = vi.fn().mockReturnValue(list);
    vi.stubGlobal('matchMedia', matchMedia);
    const prefersReducedMotion = await freshProbe();

    expect(prefersReducedMotion()).toBe(false);
    list.matches = true;
    expect(prefersReducedMotion()).toBe(true);

    expect(matchMedia).toHaveBeenCalledOnce();
  });

  // Components that call this are imported by prerendered routes, which render
  // them on the server where matchMedia does not exist.
  it('reports no preference where matchMedia is absent', async () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(await (await freshProbe())()).toBe(false);
  });
});
