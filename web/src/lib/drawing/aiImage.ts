import {
  aiGenerationState,
  AI_FAILURE_RETRY_LIMIT,
  type AiFailureDetails,
  setAiDrawing,
  restoreAiResult,
  startAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult,
  isAiGenerationActive,
  endAiGeneration,
} from '$lib/state/aiGeneration.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { apiUrl } from '$lib/api';
import {
  ASYNC_GENERATION_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { GENERATION_STYLE_PARAM } from '$lib/apiParams';
import { aiCredentialHeaders } from '$lib/ai/credentials';
import {
  setFreeGenerationsRemaining,
  setFreeGenerationsUnavailable,
} from '$lib/state/freeGenerations.svelte';
import { openAiSettings } from '$lib/state/ui.svelte';
import { exportCanvasBlob } from './engine';
import { readAiImageResponse } from './aiImageResponse';
import { awaitGeneration, generationResultUrl, type SettledGeneration } from './aiGenerationPoll';
import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
import { THROTTLED_STATUS } from '$lib/ai/generationResult';
import { autoSaveImages } from './aiAutoSave';
import { encodeWebpUpload } from './aiUploadEncoding';
import type { StyleName } from '$lib/ai/styles';

// Read by a grown-up in the problem report's diagnostics, not by the child, who
// sees the same retry card as any other transient failure.
const AI_TIMEOUT_MESSAGE = "That's taking too long — please try again.";

const FIRST_SERVER_ERROR_STATUS = 500;

// Export the composited drawing and pick the upload encoding. Returns the
// pristine PNG (for the preview + gallery auto-save) alongside the on-the-wire
// upload blob, or null when the run went stale mid-export. An export that
// produced nothing throws, so it reaches the error card exactly as a rejected
// export does and the parent is told the picture did not start.
async function exportUploadImage(
  drawing: Blob | null,
  runId: number
): Promise<{ preview: Blob; upload: Blob } | null> {
  const imageBlob = drawing ?? (await exportCanvasBlob({ includePaperTexture: false }));
  if (!isAiGenerationActive(runId)) return null;
  if (!imageBlob) throw new Error('The drawing export produced no image.');
  setAiDrawing(runId, imageBlob);
  if (!drawing) setAiPreview(runId, URL.createObjectURL(imageBlob));

  // Upload a high-quality WebP rather than the PNG: a flat-color toddler drawing
  // encodes to a fraction of the bytes, so the single buffered generate-image
  // function (ADR-0063) copies and base64s far less, and the smaller upload eats
  // less of the 26s budget. Lossy is a non-issue — the model reinterprets the
  // drawing anyway, and q0.85 is visually lossless on this input (issue #345). We
  // keep imageBlob (the pristine PNG) for the preview and the gallery auto-save,
  // and encode a throwaway WebP copy purely for the wire; if the platform can't
  // encode WebP we fall back to the PNG.
  const uploadBlob = (await encodeWebpUpload(imageBlob)) ?? imageBlob;
  return { preview: imageBlob, upload: uploadBlob };
}

// Send the raw image bytes as the body — no multipart envelope for the server
// to buffer and parse (ADR-0064). Prefer the parent's own API key (BYOK),
// then a managed access token, then the non-secret installation grant
// pseudonym. Credentials ride in headers, never the query string (which leaks
// into logs/history). The non-secret style enum is a query param.
function buildRequest(
  uploadBlob: Blob,
  style: StyleName | '',
  credentialHeaders: Record<string, string>
): { endpoint: string; headers: Record<string, string>; body: Blob } {
  const headers: Record<string, string> = {
    'Content-Type': uploadBlob.type,
    // Declares that a job ticket is an acceptable answer. The server still
    // decides — it answers in-line wherever it has no background worker to hand
    // the drawing to (ADR-0115).
    [ASYNC_GENERATION_HEADER]: '1',
    ...credentialHeaders,
  };

  const endpoint =
    apiUrl('/api/generate-image') +
    (style ? `?${GENERATION_STYLE_PARAM}=${encodeURIComponent(style)}` : '');
  return { endpoint, headers, body: uploadBlob };
}

// Drive the run's terminal UI transition from the parsed response: fail on any of
// the three error kinds, or commit the image. Returns the committed blob only when
// the image landed and the run still owns the UI, proving it is safe to auto-save.
function applyResponse(
  runId: number,
  response: SettledGeneration,
  reportToken: string | null,
  endpoint: AiFailureDetails['endpoint']
): { committedBlob: Blob } | null {
  switch (response.kind) {
    case 'safety':
      failAiGeneration(runId, { errorKind: 'safety', reportToken });
      return null;
    case 'throttled':
      failAiGeneration(runId, {
        errorKind: 'retry',
        details: { status: THROTTLED_STATUS, endpoint, message: response.detail },
      });
      console.error(
        `AI image request throttled (retry after ${response.retryAfter}s): ${response.detail}`
      );
      return null;
    case 'free-exhausted':
      setFreeGenerationsRemaining(0);
      closeAiResult();
      openAiSettings(null);
      return null;
    case 'free-unavailable':
      setFreeGenerationsUnavailable();
      closeAiResult();
      openAiSettings(null);
      return null;
    case 'error':
      // A 5xx is transient — an upstream provider failure or the server aborting
      // a too-slow call under Netlify's 26s ceiling (ADR-0063) — so offer the
      // same drawing again rather than a dead-end generic error. A 4xx (a
      // malformed/oversized request the client never actually sends) stays
      // generic.
      console.error(`AI image request failed (${response.status}): ${response.detail}`);
      failAiGeneration(runId, {
        errorKind: response.status >= FIRST_SERVER_ERROR_STATUS ? 'retry' : 'generic',
        details: { status: response.status, endpoint, message: response.detail },
      });
      return null;
  }
  return finishAiGeneration(runId, { url: URL.createObjectURL(response.blob), reportToken })
    ? { committedBlob: response.blob }
    : null;
}

function applyFreeRemaining(headers: Headers): void {
  const remainingHeader = headers.get(FREE_GENERATIONS_REMAINING_HEADER);
  if (remainingHeader === null) return;
  const remaining = Number(remainingHeader);
  if (Number.isInteger(remaining)) setFreeGenerationsRemaining(remaining);
}

// Wait for a job the server accepted, keeping the response headers that came
// back with the picture rather than the ones that came back with the ticket.
async function collectGeneration(
  jobId: string,
  pollAfterMs: number,
  signal: AbortSignal,
  credentialHeaders: Record<string, string>
): Promise<{ response: SettledGeneration; headers: Headers }> {
  let headers = new Headers();
  const response = await awaitGeneration(jobId, pollAfterMs, signal, {
    // The poll's signal, not the caller's: it carries the wait deadline as well
    // as the modal being closed, and this request is the part that can hang.
    fetchResult: async (id, pollSignal) => {
      const result = await fetch(generationResultUrl(id), {
        headers: credentialHeaders,
        signal: pollSignal,
      });
      headers = result.headers;
      return result;
    },
  });
  return { response, headers };
}

export async function generateAiImage({
  drawing = null,
  style = '',
}: { drawing?: Blob | null; style?: StyleName | '' } = {}) {
  if (aiGenerationState.phase.kind === 'generating') {
    // A run is already going. The chrome stays deliberately live while a run
    // waits in the corner (ADR-0116), so a tap on the magic button reaches here
    // and has to mean something: show me the one already running.
    if (aiGenerationState.minimized) restoreAiResult();
    return;
  }

  const controller = new AbortController();

  // Launch the loading modal the instant the button is tapped. When the caller
  // already has the drawing (the style picker hands us a blob), show it blurred
  // behind the dial straight away; otherwise open with the dial alone and slot
  // the preview in once the canvas export finishes — so the spinner never waits
  // on the export, even when customization is off and we skip the picker.
  const runId = startAiGeneration(
    drawing ? URL.createObjectURL(drawing) : null,
    controller,
    style || null
  );
  let failureEndpoint: AiFailureDetails['endpoint'] = '/api/generate-image';
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const exported = await exportUploadImage(drawing, runId);
    if (!exported) return;

    const credentialHeaders = await aiCredentialHeaders();
    const { endpoint, headers, body } = buildRequest(exported.upload, style, credentialHeaders);
    // This bound belongs to the synchronous shape only: it is sized just past
    // the platform ceiling so the server's own error always wins the race
    // (ADR-0063). A job that finished being accepted is no longer racing that
    // ceiling, so it is cleared below and the poll's own timeout takes over —
    // otherwise every background generation would be cancelled at 27s, which is
    // before the fastest tier even finishes.
    timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const started = await readAiImageResponse(res);
    // A started job is collected from a second endpoint, so the run's remaining
    // count and report token come from whichever response actually carries the
    // picture — not from the one that only accepted the work.
    if (started.kind === 'started') failureEndpoint = '/api/generation-result';
    if (started.kind === 'started' && timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    const { response, headers: settledHeaders } =
      started.kind === 'started'
        ? await collectGeneration(
            started.jobId,
            started.pollAfterMs,
            controller.signal,
            credentialHeaders
          )
        : { response: started, headers: res.headers };
    applyFreeRemaining(settledHeaders);
    // A start response that accepted the work without a readable ticket: no
    // picture came back, and the same drawing may work.
    if (response.kind === 'pending') {
      failAiGeneration(runId, {
        errorKind: 'retry',
        details: {
          status: null,
          endpoint: failureEndpoint,
          message: 'The server did not finish the picture.',
        },
      });
      return;
    }
    const committed = applyResponse(
      runId,
      response,
      settledHeaders.get(REPORT_TOKEN_HEADER),
      failureEndpoint
    );
    if (committed && settingsState.autoSaveAiEnabled) {
      await autoSaveImages(committed.committedBlob, exported.preview, runId);
    }
  } catch (err) {
    if (!isAiGenerationActive(runId)) return;
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    failAiGeneration(runId, {
      errorKind: timedOut ? 'retry' : 'generic',
      details: {
        status: null,
        endpoint: failureEndpoint,
        message: timedOut ? AI_TIMEOUT_MESSAGE : 'The picture request could not complete.',
      },
    });
    console.error(err);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    endAiGeneration(runId);
  }
}

export function retryAiImage() {
  const phase = aiGenerationState.phase;
  if (
    phase.kind !== 'error' ||
    phase.errorKind === 'safety' ||
    aiGenerationState.consecutiveFailures >= AI_FAILURE_RETRY_LIMIT
  )
    return;
  return generateAiImage({
    drawing: aiGenerationState.drawing,
    style: aiGenerationState.style ?? '',
  });
}
