import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';

const mocks = vi.hoisted(() => ({
  saveImageBlob: vi.fn<(blob: Blob, baseName: string) => Promise<SaveResult>>(),
  reportSaveFailure: vi.fn(),
}));

vi.mock('./imageSave', () => ({ saveImageBlob: mocks.saveImageBlob }));
vi.mock('$lib/state/saveFailure.svelte', () => ({ reportSaveFailure: mocks.reportSaveFailure }));

const aiPicture = new Blob(['ai'], { type: 'image/webp' });

// The drawing dedupe and the run state are module singletons, so each test starts from fresh ones.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.saveImageBlob.mockResolvedValue({ status: 'photos' });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A run that owns the AI Result with its picture revealed: the state generateAiImage auto-saves in.
async function revealedRun() {
  const { startAiGeneration, finishAiGeneration, aiGenerationState } =
    await import('$lib/state/aiGeneration.svelte');
  const runId = startAiGeneration(null);
  finishAiGeneration(runId, 'blob:ai', aiPicture.type);
  return { runId, state: aiGenerationState };
}

async function autoSaveRevealedRun(drawing: Blob) {
  const { autoSaveImages } = await import('./aiAutoSave');
  const { runId, state } = await revealedRun();
  await autoSaveImages(aiPicture, drawing, runId);
  return state;
}

function savedBaseNames(): string[] {
  return mocks.saveImageBlob.mock.calls.map(([, baseName]) => baseName);
}

describe('createDrawingDeduper', () => {
  it('dedupes a repeated signature but not against a fresh instance', async () => {
    const { createDrawingDeduper } = await import('./aiAutoSave');
    const deduper = createDrawingDeduper();
    expect(deduper.isDuplicate('sig-a')).toBe(false);
    deduper.record('sig-a');
    expect(deduper.isDuplicate('sig-a')).toBe(true);
    expect(deduper.isDuplicate('sig-b')).toBe(false);

    expect(createDrawingDeduper().isDuplicate('sig-a')).toBe(false);
  });
});

describe('autoSaveImages', () => {
  it('saves the child drawing once across re-rolls of the same unchanged drawing', async () => {
    // Same drawing bytes on every roll → the signature matches, so the drawing
    // copy dedupes while each fresh AI image still saves.
    await autoSaveRevealedRun(new Blob(['same-drawing']));
    await autoSaveRevealedRun(new Blob(['same-drawing']));

    expect(savedBaseNames().filter((tag) => tag === 'splotch-ai')).toHaveLength(2);
    expect(savedBaseNames().filter((tag) => tag === 'splotch')).toHaveLength(1);
  });

  it.each(['failed', 'denied'] as const)(
    'saves the drawing again on the next re-roll after its copy was %s, then dedupes once it lands',
    async (unsaved) => {
      mocks.saveImageBlob
        .mockResolvedValueOnce({ status: 'photos' })
        .mockResolvedValueOnce({ status: unsaved });

      await autoSaveRevealedRun(new Blob(['same-drawing']));
      await autoSaveRevealedRun(new Blob(['same-drawing']));
      await autoSaveRevealedRun(new Blob(['same-drawing']));

      expect(savedBaseNames()).toEqual([
        'splotch-ai',
        'splotch',
        'splotch-ai',
        'splotch',
        'splotch-ai',
      ]);
    }
  );

  it('dedupes against a drawing copy that landed after its run lost ownership', async () => {
    const drawingSave = Promise.withResolvers<SaveResult>();
    mocks.saveImageBlob
      .mockResolvedValueOnce({ status: 'photos' })
      .mockReturnValueOnce(drawingSave.promise);
    const { autoSaveImages } = await import('./aiAutoSave');
    const { runId } = await revealedRun();

    const superseded = autoSaveImages(aiPicture, new Blob(['same-drawing']), runId);
    await vi.waitFor(() => expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2));
    const { runId: rerollId } = await revealedRun();
    drawingSave.resolve({ status: 'photos' });
    await superseded;
    await autoSaveImages(aiPicture, new Blob(['same-drawing']), rerollId);

    expect(savedBaseNames()).toEqual(['splotch-ai', 'splotch', 'splotch-ai']);
  });

  it('reports saving until the AI picture save settles, then the folder it landed in', async () => {
    const aiSave = Promise.withResolvers<SaveResult>();
    mocks.saveImageBlob.mockReturnValueOnce(aiSave.promise);

    const { autoSaveImages } = await import('./aiAutoSave');
    const { runId, state } = await revealedRun();
    const saving = autoSaveImages(aiPicture, new Blob(['drawing']), runId);
    await vi.waitFor(() => expect(mocks.saveImageBlob).toHaveBeenCalledOnce());
    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'saving' } });

    aiSave.resolve({ status: 'chosenFolder', folderName: 'Drawings' });
    await saving;

    expect(state.phase).toMatchObject({
      kind: 'result',
      autoSave: { status: 'chosenFolder', folderName: 'Drawings' },
    });
  });

  it.each([
    ['returns failed', () => Promise.resolve<SaveResult>({ status: 'failed' })],
    ['throws', () => Promise.reject(new Error('download blocked'))],
  ])(
    'keeps the picture and reports failed when the AI picture save %s',
    async (_label, failingSave) => {
      mocks.saveImageBlob.mockImplementationOnce(failingSave);

      const state = await autoSaveRevealedRun(new Blob(['drawing']));

      expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
      expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'failed' } });
    }
  );

  it('hands the banner each denied picture and keeps the result card on its Download button', async () => {
    const drawing = new Blob(['drawing']);
    mocks.saveImageBlob.mockResolvedValue({ status: 'denied' });

    const state = await autoSaveRevealedRun(drawing);

    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'denied' } });
    expect(mocks.reportSaveFailure).toHaveBeenCalledTimes(2);
    expect(mocks.reportSaveFailure).toHaveBeenCalledWith('denied', {
      blob: aiPicture,
      baseName: 'splotch-ai',
    });
    expect(mocks.reportSaveFailure).toHaveBeenCalledWith('denied', {
      blob: drawing,
      baseName: 'splotch',
    });
  });

  it('reports a thrown save as failed with the AI picture it did not keep', async () => {
    mocks.saveImageBlob.mockRejectedValueOnce(new Error('download blocked'));

    await autoSaveRevealedRun(new Blob(['drawing']));

    expect(mocks.reportSaveFailure).toHaveBeenCalledExactlyOnceWith('failed', {
      blob: aiPicture,
      baseName: 'splotch-ai',
    });
  });

  it('keeps landed saves silent', async () => {
    const state = await autoSaveRevealedRun(new Blob(['drawing']));

    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'photos' } });
    expect(mocks.reportSaveFailure).not.toHaveBeenCalled();
  });

  // The drawing copy dedupes on a content signature, so an unchanged drawing normally saves once
  // across re-rolls. A digest the platform cannot compute yields a null signature, which is never a
  // duplicate: the copy is saved again rather than the failure escaping past the revealed picture.
  it('saves the drawing on every re-roll when its digest cannot be computed', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('digest unavailable'));
    const unchanged = new Blob(['same-drawing']);

    await autoSaveRevealedRun(unchanged);
    const state = await autoSaveRevealedRun(unchanged);

    expect(state.phase).toMatchObject({ kind: 'result', autoSave: { status: 'photos' } });
    expect(savedBaseNames().filter((tag) => tag === 'splotch-ai')).toHaveLength(2);
    expect(savedBaseNames().filter((tag) => tag === 'splotch')).toHaveLength(2);
    expect(mocks.reportSaveFailure).not.toHaveBeenCalled();
  });
});
