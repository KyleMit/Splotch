import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  saveImageBlob: vi.fn<(blob: Blob, baseName: string) => Promise<SaveResult>>(),
  reportSaveFailure: vi.fn(),
  settings: {
    aiUserApiKey: '',
    aiAccessToken: 'test-token',
    autoSaveAiEnabled: true,
  },
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./screenshot', () => ({ saveImageBlob: mocks.saveImageBlob }));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: mocks.settings }));
vi.mock('$lib/state/saveFailure.svelte', () => ({ reportSaveFailure: mocks.reportSaveFailure }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob(['result']), { status: 200 }))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function runAutoSavedGeneration(drawing: Blob) {
  mocks.exportCanvasBlob.mockResolvedValueOnce(drawing);
  const { generateAiImage } = await import('./aiImage');
  const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');
  await generateAiImage();
  return aiGenerationState;
}

describe('AI auto-save failures', () => {
  it('hands the banner each denied picture and keeps the result card on its Download button', async () => {
    const drawing = new Blob(['drawing']);
    mocks.saveImageBlob.mockResolvedValue({ status: 'denied' });

    const state = await runAutoSavedGeneration(drawing);

    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'denied' } });
    expect(mocks.reportSaveFailure).toHaveBeenCalledTimes(2);
    expect(mocks.reportSaveFailure).toHaveBeenCalledWith('denied', {
      blob: expect.any(Blob),
      baseName: 'splotch-ai',
    });
    expect(mocks.reportSaveFailure).toHaveBeenCalledWith('denied', {
      blob: drawing,
      baseName: 'splotch',
    });
  });

  it('reports a thrown save as failed with the AI picture it did not keep', async () => {
    mocks.saveImageBlob
      .mockRejectedValueOnce(new Error('download blocked'))
      .mockResolvedValueOnce({ status: 'photos' });

    await runAutoSavedGeneration(new Blob(['drawing']));

    expect(mocks.reportSaveFailure).toHaveBeenCalledExactlyOnceWith('failed', {
      blob: expect.any(Blob),
      baseName: 'splotch-ai',
    });
  });

  it('keeps landed saves silent', async () => {
    mocks.saveImageBlob.mockResolvedValue({ status: 'photos' });

    const state = await runAutoSavedGeneration(new Blob(['drawing']));

    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'photos' } });
    expect(mocks.reportSaveFailure).not.toHaveBeenCalled();
  });
});
