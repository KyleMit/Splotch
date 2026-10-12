// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_TEST_TIME_MS, pendingFixture } from './generationAttemptsTestHarness';
import { dispatchRecoveryWork, recoveryWorkerUrl } from './generationAttemptDispatch';
import { RECOVERY_WORKER_PATH, RECOVERY_WORK_TICKET_HEADER } from './generationAttemptPolicy';
import { openRecoveryWork, verifyRecoveryWork } from './generationAttemptWork';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ATTEMPT_TEST_TIME_MS);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('same-origin bounded recovery handoff', () => {
  it.each(['https://splotch.art', 'http://localhost:5173', 'http://127.0.0.1:5173'])(
    'fixes the worker path under %s',
    (origin) => {
      const url = recoveryWorkerUrl(origin);
      expect(url.origin).toBe(origin);
      expect(url.pathname).toBe(RECOVERY_WORKER_PATH);
    }
  );
  it.each([
    'http://splotch.art',
    'https://user:password@splotch.art',
    'https://splotch.art/other',
    'https://splotch.art?worker=evil',
  ])('rejects unsafe target %s', (origin) => {
    expect(() => recoveryWorkerUrl(origin)).toThrow('Recovery worker origin is invalid');
  });
  it('signs the exact bounded envelope, disables redirects and applies a finite handoff signal', async () => {
    const fixture = await pendingFixture();
    const record = await fixture.api.read(fixture.lookup);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await dispatchRecoveryWork(
      'https://splotch.art',
      record,
      { kind: 'free', identity: 'a'.repeat(64) },
      'fixture-secret'
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://splotch.art${RECOVERY_WORKER_PATH}`);
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(options?.headers);
    expect(
      verifyRecoveryWork(
        String(options?.body),
        headers.get(RECOVERY_WORK_TICKET_HEADER),
        'fixture-secret'
      )
    ).toBe(true);
    expect(String(options?.body)).not.toContain('a'.repeat(64));
    expect(
      openRecoveryWork(String(options?.body), 'fixture-secret', Date.now()).credential.identity
    ).toBe('a'.repeat(64));
  });
  it('retains pending input after unknown handoff with no synchronous claim or fallback', async () => {
    const fixture = await pendingFixture();
    const record = await fixture.api.read(fixture.lookup);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('fixture lost reply'))
    );
    await expect(
      dispatchRecoveryWork(
        'https://splotch.art',
        record,
        { kind: 'free', identity: 'a'.repeat(64) },
        'fixture-secret'
      )
    ).resolves.toBeUndefined();
    expect((await fixture.api.read(fixture.lookup)).phase).toBe('pending');
    expect(fixture.storage.entries.has(`${fixture.lookup.id}/input`)).toBe(true);
  });
});
