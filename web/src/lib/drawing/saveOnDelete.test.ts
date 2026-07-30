import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { saveOnDeleteEnabled: true },
  exportCanvasBlob: vi.fn(),
  isCanvasEmpty: vi.fn(() => false),
  getActiveOverlayImage: vi.fn(() => null),
  screenshotModuleLoads: 0,
  saveImageBlob: vi.fn(),
}));

vi.mock('$lib/state/settings.svelte', () => ({ settings: mocks.settings }));
vi.mock('./engine', () => ({
  exportCanvasBlob: mocks.exportCanvasBlob,
  isCanvasEmpty: mocks.isCanvasEmpty,
}));
vi.mock('./overlay', () => ({ getActiveOverlayImage: mocks.getActiveOverlayImage }));
vi.mock('./screenshot', () => {
  mocks.screenshotModuleLoads += 1;
  return { saveImageBlob: mocks.saveImageBlob };
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.settings.saveOnDeleteEnabled = true;
  mocks.isCanvasEmpty.mockReturnValue(false);
  mocks.screenshotModuleLoads = 0;
});

describe('saveDrawingIfEnabled', () => {
  it('starts loading the screenshot module while export is pending', async () => {
    const exportResult = deferred<Blob | null>();
    const blob = new Blob(['drawing']);
    mocks.exportCanvasBlob.mockReturnValue(exportResult.promise);
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    const saving = saveDrawingIfEnabled();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.screenshotModuleLoads).toBe(1));
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();

    exportResult.resolve(blob);
    await saving;

    expect(mocks.saveImageBlob).toHaveBeenCalledWith(blob);
  });

  it('does not load the screenshot module when saving on delete is disabled', async () => {
    mocks.settings.saveOnDeleteEnabled = false;
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    await saveDrawingIfEnabled();

    expect(mocks.screenshotModuleLoads).toBe(0);
  });

  it('does not load the screenshot module for an empty canvas', async () => {
    mocks.isCanvasEmpty.mockReturnValue(true);
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    await saveDrawingIfEnabled();

    expect(mocks.screenshotModuleLoads).toBe(0);
  });
});
