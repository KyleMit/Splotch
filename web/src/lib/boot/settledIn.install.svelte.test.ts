import { flushSync } from 'svelte';
import { expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storage';
import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
import { captureInstallPrompt, initInstallPrompt, installState } from '$lib/state/install.svelte';
import { installSettledInEffects } from './settledIn.svelte';

vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => false,
}));
vi.mock('$lib/pwa/updates', () => ({
  pwaUpdates: { registerDeferredServiceWorker: () => Promise.resolve(true) },
}));
// The unit build excludes web-only wrappers; run their real bookkeeping target.
vi.mock('./webOnlyServices', async () => ({
  recordWebInstallRepromptSession: (await import('$lib/state/install.svelte'))
    .recordInstallRepromptSession,
}));

it('counts a returning desktop session when its install prompt arrives after settling in', () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEYS.installDismissed, 'true');
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    configurable: true,
  });
  initInstallPrompt();
  expect(installState.mode).toBe('none');
  const stop = $effect.root(() => installSettledInEffects(() => ({ demand() {} })));
  try {
    for (let stroke = 0; stroke < SETTLED_IN_STROKES; stroke += 1) canvasState.recordStrokeEnd();
    flushSync();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();

    captureInstallPrompt(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
      })
    );
    flushSync();

    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('1');
  } finally {
    stop();
    localStorage.clear();
  }
});
