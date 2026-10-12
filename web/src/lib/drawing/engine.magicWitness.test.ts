import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pageCompositionKey } from '$lib/state/books';

vi.mock('./perf', () => ({ PERF_MARKS: true }));
vi.mock('../idle', () => ({ scheduleIdle: vi.fn() }));
vi.mock('./engineListeners', async (original) => ({
  ...(await original<typeof import('./engineListeners')>()),
  registerDrawingEngineListeners: vi.fn(),
}));
vi.mock('./canvas2d', () => ({ require2dContext: vi.fn(() => ({})) }));
vi.mock('./magicBrush', async (original) => ({
  ...(await original<typeof import('./magicBrush')>()),
  captureMagicSheet: vi.fn(() => null),
  initMagicBrush: vi.fn(),
  setColorSheet: vi.fn(),
  ensureMagicSheet: vi.fn(),
}));
vi.mock('./idleEmptyScan', async (original) => {
  const actual = await original<typeof import('./idleEmptyScan')>();
  return {
    createIdleEmptyScan: vi.fn((deps: import('./idleEmptyScan').IdleEmptyScanDeps) => ({
      ...actual.createIdleEmptyScan(deps),
      schedule: vi.fn(),
    })),
  };
});
vi.mock('./tiledRenderer', async (original) => ({
  ...(await original<typeof import('./tiledRenderer')>()),
  adoptTiledRenderer: vi.fn(),
  detachTiledRenderer: vi.fn(),
  syncTiledCrayonMix: vi.fn(),
  scheduleTiledHistoryFold: vi.fn(),
  recodeTiledMagicOps: vi.fn(() => false),
  hasRetainedTiledMagicOps: vi.fn(() => true),
  hasUnrevealedTiledMagicOps: vi.fn(() => true),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function recodeFixture() {
  const engine = await import('./engine');
  const magic = await import('./magicBrush');
  const tiled = await import('./tiledRenderer');
  const { createIdleEmptyScan } = await import('./idleEmptyScan');
  const mounted = engine.initDrawingCanvas(document.createElement('canvas'));
  const host = vi.mocked(magic.initMagicBrush).mock.calls[0][0];
  const idleScan = vi.mocked(createIdleEmptyScan).mock.results[0].value;
  const pendingScan = vi.mocked(createIdleEmptyScan).mock.calls[0][0];
  return { engine, magic, tiled, host, idleScan, pendingScan, mounted };
}

it('attributes the actual apply-fill no-context guard without delegating history', async () => {
  const engine = await import('./engine');
  const tiled = await import('./tiledRenderer');
  engine.applyColoringFill(null);
  expect(tiled.recodeTiledMagicOps).not.toHaveBeenCalled();
  expect(engine.getMagicWorkDebug()?.magicWorkCounts.magicRecodes['apply-fill']).toMatchObject({
    magicRecodeInvocations: 1,
    magicRecodeNoContext: 1,
    magicRecodeCompletedDelegations: 0,
  });
});

it.each(['apply-fill', 'host-repaint'] as const)(
  'attributes the actual %s no-snapshot guard',
  async (caller) => {
    const fixture = await recodeFixture();
    if (caller === 'apply-fill') fixture.engine.applyColoringFill(null);
    else fixture.host.repaint();
    expect(fixture.tiled.recodeTiledMagicOps).not.toHaveBeenCalled();
    expect(fixture.engine.getMagicWorkDebug()?.magicWorkCounts.magicRecodes[caller]).toMatchObject({
      magicRecodeInvocations: 1,
      magicRecodeNoSnapshot: 1,
    });
    fixture.mounted.teardown();
  }
);

it.each(['apply-fill', 'host-repaint'] as const)(
  'preserves real %s changed and no-change results and deferred scanning',
  async (caller) => {
    const fixture = await recodeFixture();
    const snapshot = {
      canvas: document.createElement('canvas'),
      originX: -10,
      originY: -5,
      sourceUrl: null,
    };
    vi.mocked(fixture.magic.captureMagicSheet).mockReturnValue(snapshot);
    fixture.pendingScan.run();
    for (const changed of [false, true]) {
      vi.mocked(fixture.tiled.recodeTiledMagicOps).mockReturnValueOnce(changed);
      if (caller === 'apply-fill') fixture.engine.applyColoringFill(null);
      else fixture.host.repaint();
    }
    expect(fixture.tiled.recodeTiledMagicOps).toHaveBeenCalledTimes(2);
    expect(fixture.tiled.recodeTiledMagicOps).toHaveBeenNthCalledWith(1, snapshot, null);
    expect(fixture.tiled.recodeTiledMagicOps).toHaveBeenNthCalledWith(2, snapshot, null);
    expect(fixture.idleScan.schedule).toHaveBeenCalledTimes(2);
    expect(fixture.engine.getMagicWorkDebug()?.magicWorkCounts.magicRecodes[caller]).toMatchObject({
      magicRecodeInvocations: 2,
      magicRecodeCompletedDelegations: 2,
      magicRecodeChanges: 1,
      magicRecodeNoChanges: 1,
    });
    fixture.mounted.teardown();
  }
);

it('registers the actual appearance before delegation and preserves source keys and exceptions', async () => {
  const fixture = await recodeFixture();
  fixture.engine.applyColoringFill('/page.light.webp');
  const snapshot = {
    canvas: document.createElement('canvas'),
    originX: 0,
    originY: 0,
    sourceUrl: '/other.light.webp',
  };
  vi.mocked(fixture.magic.captureMagicSheet).mockReturnValue(snapshot);
  expect(() => fixture.host.repaint()).toThrow('publication does not match');
  expect(fixture.tiled.recodeTiledMagicOps).not.toHaveBeenCalled();
  snapshot.sourceUrl = '/page.light.webp';
  const error = new Error('Real renderer rejected recode');
  vi.mocked(fixture.tiled.recodeTiledMagicOps).mockImplementationOnce(() => {
    throw error;
  });
  expect(() => fixture.host.repaint()).toThrow(error);
  expect(fixture.tiled.recodeTiledMagicOps).toHaveBeenCalledExactlyOnceWith(
    snapshot,
    pageCompositionKey(snapshot.sourceUrl)
  );
  expect(fixture.idleScan.schedule).not.toHaveBeenCalled();
  expect(
    fixture.engine.getMagicWorkDebug()?.magicWorkCounts.magicRecodes['host-repaint']
  ).toMatchObject({ magicRecodeInvocations: 2, magicRecodeThrows: 2, magicRecodeNoChanges: 0 });
  fixture.mounted.teardown();
});
