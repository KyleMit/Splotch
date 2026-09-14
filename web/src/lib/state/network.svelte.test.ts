import { beforeEach, describe, expect, it, vi } from 'vitest';

type StatusListener = (status: { connected: boolean }) => void;

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn<() => Promise<{ connected: boolean }>>(),
  addListener:
    vi.fn<(event: string, listener: StatusListener) => Promise<{ remove: () => void }>>(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => true,
}));
vi.mock('@capacitor/network', () => ({
  Network: { getStatus: mocks.getStatus, addListener: mocks.addListener },
}));

describe('native network status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps a status change that arrives before the initial status read resolves', async () => {
    let resolveStatus!: (status: { connected: boolean }) => void;
    mocks.getStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    let listener: StatusListener | undefined;
    mocks.addListener.mockImplementation(async (_event, callback) => {
      listener = callback;
      return { remove: () => {} };
    });

    const { network } = await import('./network.svelte');
    await vi.waitFor(() => expect(listener).toBeDefined());

    listener!({ connected: false });
    resolveStatus({ connected: true });
    await vi.waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(network.online).toBe(false);
  });

  it('uses the initial native status when no event has arrived', async () => {
    mocks.getStatus.mockResolvedValue({ connected: false });
    mocks.addListener.mockResolvedValue({ remove: () => {} });

    const { network } = await import('./network.svelte');

    await vi.waitFor(() => expect(network.online).toBe(false));
    expect(mocks.getStatus).toHaveBeenCalledOnce();
  });

  it('applies later events after the initial native status', async () => {
    mocks.getStatus.mockResolvedValue({ connected: false });
    let listener: StatusListener | undefined;
    mocks.addListener.mockImplementation(async (_event, callback) => {
      listener = callback;
      return { remove: () => {} };
    });
    const { network } = await import('./network.svelte');
    await vi.waitFor(() => expect(network.online).toBe(false));

    listener!({ connected: true });
    expect(network.online).toBe(true);
    listener!({ connected: false });
    expect(network.online).toBe(false);
  });
});
