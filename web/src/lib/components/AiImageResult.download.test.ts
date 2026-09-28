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
const NEXT_RESULT_URL = 'blob:ai-result-next';
const picture = new Blob(['ai picture'], { type: 'image/webp' });

let mounted: ReturnType<typeof mount> | null = null;

function finishResult(url: string) {
  const run = startAiGeneration('blob:drawing');
  finishAiGeneration(run, url, 'image/webp');
  flushSync();
}

function downloadButton(target: HTMLElement) {
  const download = target.querySelector<HTMLButtonElement>('.ai-result-download');
  if (!download) throw new Error('The AI result card did not offer Download');
  return download;
}

function showResult() {
  finishResult(RESULT_URL);
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiImageResult, { target });
  flushSync();
  const dialog = target.querySelector('dialog');
  if (!dialog) throw new Error('The AI result card did not render');
  return { target, dialog, download: downloadButton(target) };
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
      if (url !== RESULT_URL && url !== NEXT_RESULT_URL) throw new Error(`Unexpected ${url}`);
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

  it('offers the next result a save while a closed card is still saving', async () => {
    const firstSave = Promise.withResolvers<SaveResult>();
    saveImageBlob.mockReturnValueOnce(firstSave.promise).mockResolvedValue({ status: 'photos' });
    const { target, download } = showResult();

    await tapDownload(download);
    closeAiResult();
    finishResult(NEXT_RESULT_URL);
    downloadButton(target).click();

    await vi.waitFor(() => expect(saveImageBlob).toHaveBeenCalledTimes(2));
    firstSave.resolve({ status: 'photos' });
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
