// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({ enabled: false }));
vi.mock('./perf', () => ({
  get PERF_MARKS() {
    return control.enabled;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'imports and reads plain owners without browser globals, PERF=%s',
  async (enabled) => {
    vi.resetModules();
    control.enabled = enabled;
    for (const name of ['Worker', 'Image', 'document', '__PERF_MARKS__'])
      vi.stubGlobal(name, undefined);
    const { magicWorkWitness } = await import('./magicWorkWitness');
    vi.stubGlobal('performance', undefined);
    const snapshot = magicWorkWitness({ brush: 'pen', engineLive: false, paperSized: false });
    expect(snapshot === null).toBe(!enabled);
    expect(snapshot?.magicWorkerState?.magicWorkerExists ?? false).toBe(false);
    expect(snapshot?.magicBrushState?.magicPoolExists ?? false).toBe(false);
  }
);
