import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';

const saveImageBlob = vi.hoisted(() =>
  vi.fn<(blob: Blob, baseName: string, opts?: { allowPrompt?: boolean }) => Promise<SaveResult>>()
);
const reportSaveFailure = vi.hoisted(() => vi.fn(async () => {}));
const triggerDownload = vi.hoisted(() => vi.fn());

vi.mock('$lib/drawing/imageSave', () => ({ saveImageBlob }));
vi.mock('$lib/state/saveFailure.svelte', () => ({ reportSaveFailure }));
vi.mock('$lib/savedFile', async (importActual) => ({
  ...(await importActual<typeof import('$lib/savedFile')>()),
  triggerDownload,
}));
// The dial's reveal is an animation driven by the run; the card is tested with it already landed.
vi.mock('$lib/state/aiProgress.svelte', () => ({
  aiProgressState: { revealed: true, value: 1 },
}));

import AiImageResult from './AiImageResult.svelte';
import { AI_IMAGE_BASENAME } from '$lib/saveNaming';
import {
  aiGenerationState,
  closeAiResult,
  finishAiGeneration,
  startAiGeneration,
} from '$lib/state/aiGeneration.svelte';

const RESULT_URL = 'blob:ai-result';
const picture = new Blob(['ai picture'], { type: 'image/webp' });

let mounted: ReturnType<typeof mount> | null = null;

function showResult() {
  const run = startAiGeneration('blob:drawing');
  finishAiGeneration(run, RESULT_URL, 'image/webp');
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiImageResult, { target });
  flushSync();
  const dialog = target.querySelector('dialog');
  const download = target.querySelector<HTMLButtonElement>('.ai-result-download');
  if (!dialog || !download) throw new Error('The AI result card did not offer Download');
  return { dialog, download };
}

async function tapDownload(download: HTMLButtonElement) {
  download.click();
  await vi.waitFor(() => expect(saveImageBlob).toHaveBeenCalled());
  // A macrotask lets the handler's remaining awaits settle before the card is inspected.
  await new Promise((resolve) => setTimeout(resolve));
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url !== RESULT_URL) throw new Error(`Unexpected fetch of ${url}`);
      return new Response(picture);
    })
  );
});

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  closeAiResult();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  saveImageBlob.mockReset();
  reportSaveFailure.mockClear();
  triggerDownload.mockClear();
});

describe('AI result Download', () => {
  it('saves the picture through the save pipeline and sends the card off', async () => {
    saveImageBlob.mockResolvedValue({ status: 'photos' });
    const { dialog, download } = showResult();

    await tapDownload(download);

    const [saved, baseName, opts] = saveImageBlob.mock.calls[0];
    expect(await saved.text()).toBe('ai picture');
    expect(baseName).toBe(AI_IMAGE_BASENAME);
    expect(opts).toEqual({ allowPrompt: true });
    expect(triggerDownload).not.toHaveBeenCalled();
    expect(reportSaveFailure).not.toHaveBeenCalled();
    expect(dialog.classList.contains('polaroid-mode')).toBe(true);
  });

  it('keeps the picture on the card and reports a save that did not land', async () => {
    saveImageBlob.mockResolvedValue({ status: 'denied' });
    const { dialog, download } = showResult();

    await tapDownload(download);

    expect(reportSaveFailure).toHaveBeenCalledExactlyOnceWith('denied', {
      blob: saveImageBlob.mock.calls[0][0],
      baseName: AI_IMAGE_BASENAME,
    });
    expect(dialog.classList.contains('polaroid-mode')).toBe(false);
    expect(aiGenerationState.phase.kind).toBe('result');
  });

  it('reports a save whose pipeline threw as failed', async () => {
    const error = new Error('chunk load failed');
    saveImageBlob.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dialog, download } = showResult();

    await tapDownload(download);

    expect(reportSaveFailure).toHaveBeenCalledExactlyOnceWith('failed', {
      blob: saveImageBlob.mock.calls[0][0],
      baseName: AI_IMAGE_BASENAME,
    });
    expect(console.error).toHaveBeenCalledWith('Saving the AI picture failed:', error);
    expect(dialog.classList.contains('polaroid-mode')).toBe(false);
  });
});
