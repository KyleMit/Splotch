import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const control = vi.hoisted(() => ({ enabled: true }));
vi.mock('./perf', () => ({
  get PERF_MARKS() {
    return control.enabled;
  },
}));

beforeEach(() => {
  control.enabled = true;
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

it('copies counter trees instead of returning mutable owner state', async () => {
  const { createMagicWorkCounters } = await import('./magicWorkDebug');
  const first = createMagicWorkCounters();
  const other = createMagicWorkCounters();
  first.recordMainAttempt('fill-direct', 'ensure', true);
  first.recordMainOutcome('fill');
  const copy = first.snapshot();
  Reflect.set(copy.magicMainCauses, 'fill-direct', 99);
  expect(first.snapshot()).toMatchObject({
    magicMainAttempts: 1,
    magicMainPaints: 1,
    magicMainCauses: { 'fill-direct': 1 },
  });
  expect(other.snapshot()).toMatchObject({ magicMainAttempts: 0, magicMainPaints: 0 });
});

describe.each(['apply-fill', 'host-repaint'] as const)('recode caller %s', (caller) => {
  it.each(['no-context', 'no-snapshot', false, true] as const)(
    'records the real %s result after exactly one invocation',
    async (outcome) => {
      const { traceMagicRecode } = await import('./magicWorkWitness');
      const { magicWorkCounters } = await import('./magicWorkDebug');
      const recode = vi.fn(() => outcome);
      expect(traceMagicRecode(caller, recode)).toBe(outcome);
      expect(recode).toHaveBeenCalledOnce();
      expect(magicWorkCounters?.snapshot().magicRecodes[caller]).toEqual({
        magicRecodeInvocations: 1,
        magicRecodeNoContext: Number(outcome === 'no-context'),
        magicRecodeNoSnapshot: Number(outcome === 'no-snapshot'),
        magicRecodeCompletedDelegations: Number(typeof outcome === 'boolean'),
        magicRecodeChanges: Number(outcome === true),
        magicRecodeNoChanges: Number(outcome === false),
        magicRecodeThrows: 0,
      });
    }
  );

  it('records and preserves the original exception', async () => {
    const { traceMagicRecode } = await import('./magicWorkWitness');
    const { magicWorkCounters } = await import('./magicWorkDebug');
    const error = new Error('Real recode failed');
    const recode = vi.fn(() => {
      throw error;
    });
    expect(() => traceMagicRecode(caller, recode)).toThrow(error);
    expect(recode).toHaveBeenCalledOnce();
    expect(magicWorkCounters?.snapshot().magicRecodes[caller]).toMatchObject({
      magicRecodeInvocations: 1,
      magicRecodeCompletedDelegations: 0,
      magicRecodeThrows: 1,
    });
  });

  it('returns the same real outcome with PERF disabled and reads no clock', async () => {
    control.enabled = false;
    const { traceMagicRecode } = await import('./magicWorkWitness');
    const now = vi.spyOn(performance, 'now');
    const recode = vi.fn(() => false);
    expect(traceMagicRecode(caller, recode)).toBe(false);
    expect(recode).toHaveBeenCalledOnce();
    expect(now).not.toHaveBeenCalled();
  });
});

it('exposes finite source kinds and readonly nested coordinates through the combined seam', async () => {
  const { magicWorkWitness } = await import('./magicWorkWitness');
  const snapshot = magicWorkWitness({ brush: 'pen', engineLive: false, paperSized: false });
  expectTypeOf(snapshot?.magicBrushState?.magicSourceKind).toEqualTypeOf<
    'none' | 'fill' | 'gradient' | undefined
  >();
  expectTypeOf(snapshot?.magicBrushState?.magicPaperSize).toEqualTypeOf<
    Readonly<{ width: number; height: number }> | null | undefined
  >();
  expectTypeOf(snapshot?.magicBrushState?.magicSheetOrigin).toEqualTypeOf<
    Readonly<{ x: number; y: number }> | undefined
  >();
});
