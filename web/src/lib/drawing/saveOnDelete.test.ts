import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { saveOnDeleteEnabled: true },
  exportCanvasBlob: vi.fn(),
  isCanvasEmpty: vi.fn(() => false),
  screenshotModuleLoads: 0,
  saveImageBlob: vi.fn(),
  reportSaveFailure: vi.fn(),
}));

vi.mock('$lib/state/settings.svelte', () => ({ settingsState: mocks.settings }));
vi.mock('./engine', () => ({
  exportCanvasBlob: mocks.exportCanvasBlob,
  isCanvasEmpty: mocks.isCanvasEmpty,
}));
vi.mock('$lib/state/saveFailure.svelte', () => ({
  reportSaveFailure: mocks.reportSaveFailure,
}));
vi.mock('./screenshot', () => {
  mocks.screenshotModuleLoads += 1;
  return { saveImageBlob: mocks.saveImageBlob };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.settings.saveOnDeleteEnabled = true;
  mocks.isCanvasEmpty.mockReturnValue(false);
  mocks.screenshotModuleLoads = 0;
  mocks.saveImageBlob.mockResolvedValue({ status: 'photos' });
});

describe('saveDrawingIfEnabled', () => {
  it('starts loading the screenshot module while export is pending', async () => {
    const exportResult = Promise.withResolvers<Blob | null>();
    const blob = new Blob(['drawing']);
    mocks.exportCanvasBlob.mockReturnValue(exportResult.promise);
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    const saving = saveDrawingIfEnabled();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.screenshotModuleLoads).toBe(1));
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();

    exportResult.resolve(blob);
    await saving;

    expect(mocks.saveImageBlob).toHaveBeenCalledWith(blob, 'splotch');
  });

  it.each([
    ['denied', () => Promise.resolve({ status: 'denied' })],
    ['failed', () => Promise.resolve({ status: 'failed' })],
    ['failed', () => Promise.reject(new Error('chunk load failed'))],
  ] as const)(
    'hands the banner the wiped drawing when its save comes back %s',
    async (outcome, failingSave) => {
      const blob = new Blob(['wiped drawing']);
      mocks.exportCanvasBlob.mockResolvedValue(blob);
      mocks.saveImageBlob.mockImplementation(failingSave);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { saveDrawingIfEnabled } = await import('./saveOnDelete');

      await saveDrawingIfEnabled();

      expect(mocks.reportSaveFailure).toHaveBeenCalledExactlyOnceWith(outcome, {
        blob,
        baseName: 'splotch',
      });
    }
  );

  it('keeps a landed save silent', async () => {
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveImageBlob.mockResolvedValue({ status: 'photos' });
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    await saveDrawingIfEnabled();

    expect(mocks.reportSaveFailure).not.toHaveBeenCalled();
  });

  it('reports a drawing the export could not capture without a picture to retry', async () => {
    mocks.exportCanvasBlob.mockResolvedValue(null);
    const { saveDrawingIfEnabled } = await import('./saveOnDelete');

    await saveDrawingIfEnabled();

    expect(mocks.reportSaveFailure).toHaveBeenCalledExactlyOnceWith('failed', null);
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
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
