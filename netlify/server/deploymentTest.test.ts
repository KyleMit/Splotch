// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { projectApiKey } from './deploymentTest';
import { fakeAiProvider } from './ai/fake';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('authorizes managed test generation without consulting a production key or network', async () => {
  vi.useFakeTimers();
  vi.stubEnv('OPENAI_API_KEY', 'production-key-must-not-be-used');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const key = projectApiKey();
  const pending = fakeAiProvider.verifyKey(key);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual({ ok: true });
  expect(key).not.toBe(process.env.OPENAI_API_KEY);
  expect(fetch).not.toHaveBeenCalled();
});
