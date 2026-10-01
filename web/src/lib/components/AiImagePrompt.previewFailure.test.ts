import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn<() => Promise<Blob | null>>(),
}));

vi.mock('$lib/drawing/engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('$lib/drawing/aiImage', () => ({ generateAiImage: vi.fn() }));

import AiImagePrompt from './AiImagePrompt.svelte';
import { aiPromptModal } from '$lib/state/ui.svelte';

const PREVIEW_FAILED_COPY = "We couldn't read the drawing. Close this and try the wand again.";

let mounted: ReturnType<typeof mount> | null = null;

function openPrompt() {
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiImagePrompt, { target });
  aiPromptModal.show(null);
  flushSync();
  return target;
}

async function settledPrompt(target: HTMLElement) {
  await vi.waitFor(() => expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce());
  await Promise.resolve();
  flushSync();
  const styleButtons = [...target.querySelectorAll<HTMLButtonElement>('.ai-style-option')];
  return {
    open: aiPromptModal.open,
    alert: target.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    styleButtonsDisabled: styleButtons.length > 0 && styleButtons.every((b) => b.disabled),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  aiPromptModal.hide();
  flushSync();
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  mocks.exportCanvasBlob.mockReset();
});

describe('AiImagePrompt preview export failure', () => {
  it('tells the parent the drawing could not be read when the export produced nothing', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(null);

    expect(await settledPrompt(openPrompt())).toEqual({
      open: true,
      alert: PREVIEW_FAILED_COPY,
      styleButtonsDisabled: true,
    });
  });

  it('tells the parent the drawing could not be read when the export rejected', async () => {
    mocks.exportCanvasBlob.mockRejectedValueOnce(new Error('chunk load failed'));

    expect(await settledPrompt(openPrompt())).toEqual({
      open: true,
      alert: PREVIEW_FAILED_COPY,
      styleButtonsDisabled: true,
    });
  });

  it('shows no failure once the preview export succeeds', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing'], { type: 'image/png' }));

    expect(await settledPrompt(openPrompt())).toEqual({
      open: true,
      alert: null,
      styleButtonsDisabled: false,
    });
  });
});
