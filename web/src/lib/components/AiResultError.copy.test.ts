import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_TOKEN_HEADER } from '$lib/apiHeaders';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  settings: {
    aiUserApiKey: '',
    aiAccessToken: 'test-token',
    autoSaveAiEnabled: false,
    aiCredentialKind: () => 'accessCode' as const,
  },
}));

vi.mock('$lib/drawing/engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('$lib/drawing/aiUploadEncoding', () => ({ encodeWebpUpload: async () => null }));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: mocks.settings }));

import AiResultError from './AiResultError.svelte';
import { generateAiImage } from '$lib/drawing/aiImage';
import { aiGenerationState, closeAiResult } from '$lib/state/aiGeneration.svelte';

let mounted: ReturnType<typeof mount> | null = null;

function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// What the child sees for the phase a real run left behind, and the diagnostic
// rows the grown-ups' problem report would send.
function renderedFailure() {
  const phase = aiGenerationState.phase;
  if (phase.kind !== 'error') throw new Error(`Expected an error phase, got ${phase.kind}`);
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiResultError, {
    target,
    props: {
      error: phase,
      previewUrl: 'blob:drawing',
      style: null,
      attempts: aiGenerationState.consecutiveFailures,
      reportOrigin: null,
      onRequestReport: () => {},
      status: 'idle',
    },
  });
  flushSync();
  const diagnostics = [...target.querySelectorAll('dialog dl > div')].map(textOf);
  target.querySelector('dialog')?.remove();
  return { card: textOf(target), diagnostics };
}

async function failWith(response: () => Promise<Response>) {
  mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing'], { type: 'image/png' }));
  vi.stubGlobal('fetch', vi.fn(response));
  await generateAiImage();
}

const REFUSAL_CARD =
  "Let's try drawing something else! That picture didn't work — try drawing something different! For grown-ups Report this refusal";
const FIRST_FAILURE_CARD = "Hmm, that didn't work Let's give it one more go. Try again";

function problemRows(error: string, message: string, attempts: number) {
  return [
    `Error: ${error}`,
    `Message: ${message}`,
    `Attempts: ${attempts} in a row`,
    'App version: 1.0.0-test (web)',
    'Art style: Default',
  ];
}

beforeEach(() => {
  closeAiResult();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AiResultError rendered copy', () => {
  it('guides the child to draw something else after a safety refusal', async () => {
    await failWith(async () => new Response('blocked', { status: 422 }));

    expect(renderedFailure()).toEqual({ card: REFUSAL_CARD, diagnostics: [] });
  });

  it('reads the same when the refusal carries a report token', async () => {
    await failWith(
      async () =>
        new Response('blocked', { status: 422, headers: { [REPORT_TOKEN_HEADER]: 'signed' } })
    );

    expect(renderedFailure()).toEqual({ card: REFUSAL_CARD, diagnostics: [] });
  });

  it.each([
    [
      'a server error',
      async () => new Response('Upstream unavailable', { status: 502 }),
      problemRows('502 · /api/generate-image', 'Upstream unavailable', 1),
    ],
    [
      'throttling',
      async () => new Response('Please wait', { status: 429, headers: { 'Retry-After': '12' } }),
      problemRows('429 · /api/generate-image', 'Please wait', 1),
    ],
    [
      'a client error',
      async () => new Response('Image is too large', { status: 413 }),
      problemRows('413 · /api/generate-image', 'Image is too large', 1),
    ],
    // The timeout text reaches only the report's diagnostics; the child sees
    // the same card as any other retryable failure.
    [
      'the request timing out',
      async () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')),
      problemRows(
        'No response · /api/generate-image',
        "That's taking too long — please try again.",
        1
      ),
    ],
    [
      'the request failing outright',
      async () => Promise.reject(new TypeError('Failed to fetch')),
      problemRows(
        'No response · /api/generate-image',
        'The picture request could not complete.',
        1
      ),
    ],
  ])('shows the error card after %s, and reports what went wrong', async (_, response, rows) => {
    await failWith(response);

    expect(renderedFailure()).toEqual({ card: FIRST_FAILURE_CARD, diagnostics: rows });
  });

  it('tells the child to rest after repeated failures', async () => {
    await failWith(async () => new Response('Upstream unavailable', { status: 502 }));
    await failWith(async () => new Response('Upstream unavailable', { status: 503 }));

    expect(renderedFailure()).toEqual({
      card: "Still not working The picture-maker needs a little rest. Let's keep drawing! Keep drawing Try the wand again in a few minutes.",
      diagnostics: problemRows('503 · /api/generate-image', 'Upstream unavailable', 2),
    });
  });
});
