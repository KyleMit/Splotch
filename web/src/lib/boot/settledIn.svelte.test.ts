import { flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
import { installSettledInEffects } from './settledIn.svelte';

const services = vi.hoisted(() => ({
  registerDeferredServiceWorker: vi.fn(() => Promise.resolve(true)),
  recordWebInstallRepromptSession: vi.fn(),
}));
vi.mock('$lib/pwa/updates', () => ({ pwaUpdates: services }));
vi.mock('./webOnlyServices', () => services);

let stop = () => {};

afterEach(() => {
  stop();
  canvasState.strokeCount = 0;
  vi.resetAllMocks();
});

function drawThroughThreshold() {
  for (let count = 1; count <= SETTLED_IN_STROKES + 3; count += 1) {
    canvasState.strokeCount = count;
    flushSync();
  }
}

describe('settled-in drawing effects', () => {
  it('requests registration only once across strokes past the threshold', () => {
    stop = $effect.root(() => installSettledInEffects(() => null));
    flushSync();
    expect(services.registerDeferredServiceWorker).not.toHaveBeenCalled();

    drawThroughThreshold();

    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('records the install session and demands its banner once across later strokes', () => {
    const demand = vi.fn();
    stop = $effect.root(() => installSettledInEffects(() => ({ demand })));
    flushSync();
    expect(demand).not.toHaveBeenCalled();

    drawThroughThreshold();

    expect(services.recordWebInstallRepromptSession).toHaveBeenCalledTimes(1);
    expect(demand).toHaveBeenCalledExactlyOnceWith('installBanner');
  });

  it('waits for a later stroke after each failure without repeating pending or successful work', async () => {
    const attempt = Promise.withResolvers<boolean>();
    services.registerDeferredServiceWorker.mockReturnValueOnce(attempt.promise);
    services.registerDeferredServiceWorker.mockResolvedValueOnce(false);
    stop = $effect.root(() => installSettledInEffects(() => null));
    drawThroughThreshold();
    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(1);

    attempt.resolve(false);
    await tick();
    await tick();
    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(1);

    canvasState.strokeCount += 1;
    await tick();
    await tick();
    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(2);

    canvasState.strokeCount += 1;
    await tick();
    await tick();
    canvasState.strokeCount += 1;
    await tick();
    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(3);
  });

  it('demands a late overlay controller without tracking bookkeeping state', () => {
    let recorded = $state(false);
    const demand = vi.fn();
    let overlays = $state<{ demand: typeof demand } | null>(null);
    services.recordWebInstallRepromptSession.mockImplementation(() => {
      void recorded;
    });
    stop = $effect.root(() => installSettledInEffects(() => overlays));
    drawThroughThreshold();
    expect(demand).not.toHaveBeenCalled();

    overlays = { demand };
    flushSync();
    recorded = true;
    flushSync();

    expect(services.recordWebInstallRepromptSession).toHaveBeenCalledTimes(1);
    expect(demand).toHaveBeenCalledExactlyOnceWith('installBanner');
  });

  it('ignores a registration failure after the route unmounts', async () => {
    const attempt = Promise.withResolvers<boolean>();
    services.registerDeferredServiceWorker.mockReturnValueOnce(attempt.promise);
    stop = $effect.root(() => installSettledInEffects(() => null));
    drawThroughThreshold();
    stop();
    attempt.resolve(false);
    await tick();
    canvasState.strokeCount += 1;
    await tick();

    expect(services.registerDeferredServiceWorker).toHaveBeenCalledTimes(1);
  });
});
