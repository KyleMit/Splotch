import {
  aiResult,
  startAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult,
  isAiGenerationActive,
  endAiGeneration,
} from '$lib/state/aiGeneration.svelte';
import { settings } from '$lib/state/settings.svelte';
import { apiUrl } from '$lib/api';
import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
} from '$lib/apiHeaders';
import {
  installationId,
  setFreeGenerationsRemaining,
  setFreeGenerationsUnavailable,
} from '$lib/state/freeGenerations.svelte';
import { openAiSettings } from '$lib/state/ui.svelte';
import { exportCanvasBlob } from './engine';
import { readAiImageResponse, type AiImageResponse } from './aiImageResponse';
import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME } from '$lib/saveNaming';
import type { StyleName } from '$lib/ai/styles';

export const AI_SAFETY_REFUSAL_MESSAGE = "Let's try drawing something else!";
export const AI_TIMEOUT_MESSAGE = "That's taking too long — please try again.";

const UPLOAD_WEBP_QUALITY = 0.85;
const FIRST_SERVER_ERROR_STATUS = 500;

// No API reports canvas encode capability directly; the spec-mandated PNG
// fallback for an unsupported type IS the feature signal, so a 1×1 probe
// answers in ~1 ms. Memoized per page load and deliberately never persisted:
// a stored "no" would outlive a Safari upgrade that adds a WebP encoder and
// silently disable the smaller upload forever.
let webpEncodeSupported: boolean | null = null;

function canEncodeWebp(): boolean {
  if (webpEncodeSupported === null) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupported = probe.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpEncodeSupported;
}

// Transcode the composited drawing to WebP for the upload only. Decoding the PNG
// and re-encoding is exact on the source pixels, so the model sees the same
// image at a fraction of the bytes. Returns null (caller falls back to the PNG)
// if the platform can't decode/encode or the encoder declines.
async function encodeWebpUpload(png: Blob): Promise<Blob | null> {
  try {
    // Skipping outright on a non-encoding engine matters: Safari has no canvas
    // WebP encoder (the WebP-encoder row in docs/COMPATIBILITY.md), so without
    // this gate an iPad spends ~105 ms of blocked main thread per generation
    // decoding and re-encoding a blob the type guard below then discards —
    // measured on device, docs/scratchpad/webp-upload-encode-cost-2026-08.md.
    if (!canEncodeWebp()) return null;
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', UPLOAD_WEBP_QUALITY)
    );
    // A platform without WebP encoding hands back a PNG (or null) here; only take
    // the result when it's genuinely smaller WebP, so we never upload a fatter
    // re-encode than the original.
    return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;
  } catch {
    return null;
  }
}

// Tracks the signature of the drawing saved on the previous AI run so we can skip
// re-saving the child's artwork when they re-roll a new style on an unchanged
// drawing — the AI image is always fresh, but the drawing copy would just be a
// duplicate. Constructible so tests can exercise the dedupe in isolation instead
// of driving it end-to-end through a shared module instance.
export function createDrawingDeduper() {
  let lastSavedDrawingSig: string | null = null;
  return {
    isDuplicate(sig: string | null): boolean {
      return sig !== null && sig === lastSavedDrawingSig;
    },
    record(sig: string | null): void {
      lastSavedDrawingSig = sig;
    },
  };
}

const drawingSaver = createDrawingDeduper();

async function blobSignature(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

// Drop the finished AI image into the gallery (a download on the web), and tuck
// the child's own drawing in alongside it — but only when the drawing actually
// changed since the last AI run, so duplicates don't pile up.
async function autoSaveImages(aiBlob: Blob, drawingBlob: Blob, runId: number) {
  if (!isAiGenerationActive(runId)) return;
  // The save pipeline loads on demand so this module — statically imported by
  // ActionsPanel — doesn't drag it into the startup bundle (issue #461). A
  // failed chunk load is contained here: the AI image already committed to the
  // result modal, so it must degrade like any other silent save failure rather
  // than bubbling into generateAiImage's error UI.
  let saveImageBlob: (typeof import('./screenshot'))['saveImageBlob'];
  try {
    ({ saveImageBlob } = await import('./screenshot'));
  } catch (err) {
    console.error('Auto-save failed:', err);
    return;
  }
  await saveImageBlob(aiBlob, AI_IMAGE_BASENAME);
  if (!isAiGenerationActive(runId)) return;
  const sig = await blobSignature(drawingBlob);
  if (!isAiGenerationActive(runId)) return;
  if (!drawingSaver.isDuplicate(sig)) {
    await saveImageBlob(drawingBlob, DRAWING_BASENAME);
  }
  // Record the signature of the drawing we just saved even if ownership was lost
  // during that save: the drawing is already in the gallery, so a later owning run
  // on the same unchanged drawing must dedupe against it. Returning here (the old
  // post-save ownership check) left the signature stale and re-saved a duplicate.
  drawingSaver.record(sig);
}

// Export the composited drawing and pick the upload encoding. Returns the
// pristine PNG (for the preview + gallery auto-save) alongside the on-the-wire
// upload blob, or null when the run went stale mid-export or the export failed —
// the failed-export case closes the result modal itself, so the caller can bail
// on null without distinguishing the two.
async function exportUploadImage(
  drawing: Blob | null,
  runId: number
): Promise<{ preview: Blob; upload: Blob } | null> {
  const imageBlob = drawing ?? (await exportCanvasBlob({ includePaperTexture: false }));
  if (!isAiGenerationActive(runId)) return null;
  if (!imageBlob) {
    closeAiResult();
    return null;
  }
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
// to buffer and parse (ADR-0064). Prefer the parent's own Gemini key (BYOK),
// then a managed access token, then the non-secret installation grant
// pseudonym. Credentials ride in headers, never the query string (which leaks
// into logs/history). The non-secret style enum is a query param.
function buildRequest(
  uploadBlob: Blob,
  style: string,
  freeInstallationId: string | null
): { endpoint: string; headers: Record<string, string>; body: Blob } {
  const headers: Record<string, string> = {
    'Content-Type': uploadBlob.type || 'image/png',
  };
  if (settings.aiUserApiKey) headers[API_KEY_HEADER] = settings.aiUserApiKey;
  else if (freeInstallationId) headers[INSTALLATION_ID_HEADER] = freeInstallationId;
  else headers[ACCESS_TOKEN_HEADER] = settings.aiAccessToken;

  const endpoint =
    apiUrl('/api/generate-image') + (style ? `?style=${encodeURIComponent(style)}` : '');
  return { endpoint, headers, body: uploadBlob };
}

// Drive the run's terminal UI transition from the parsed response: fail on any of
// the three error kinds, or commit the image. Returns the committed blob only when
// the image landed and the run still owns the UI, proving it is safe to auto-save.
function applyResponse(runId: number, response: AiImageResponse): { committedBlob: Blob } | null {
  switch (response.kind) {
    case 'safety':
      failAiGeneration(runId, AI_SAFETY_REFUSAL_MESSAGE, 'safety');
      return null;
    case 'throttled':
      failAiGeneration(runId, undefined, 'retry');
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
      // A 5xx is transient — an upstream Gemini failure or the server aborting
      // a too-slow call under Netlify's 26s ceiling (ADR-0063) — so offer the
      // same drawing again rather than a dead-end generic error. A 4xx (a
      // malformed/oversized request the client never actually sends) stays
      // generic.
      console.error(`AI image request failed (${response.status}): ${response.detail}`);
      failAiGeneration(
        runId,
        undefined,
        response.status >= FIRST_SERVER_ERROR_STATUS ? 'retry' : 'generic'
      );
      return null;
  }
  return finishAiGeneration(runId, URL.createObjectURL(response.blob), response.blob.type)
    ? { committedBlob: response.blob }
    : null;
}

export async function generateAiImage({
  drawing = null,
  style = '',
}: { drawing?: Blob | null; style?: StyleName | '' } = {}) {
  if (aiResult.generating) return;

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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const exported = await exportUploadImage(drawing, runId);
    if (!exported) return;

    const freeInstallationId =
      settings.aiUserApiKey || settings.aiAccessToken ? null : await installationId();
    const { endpoint, headers, body } = buildRequest(exported.upload, style, freeInstallationId);
    timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const remainingHeader = res.headers.get(FREE_GENERATIONS_REMAINING_HEADER);
    if (remainingHeader !== null) {
      const remaining = Number(remainingHeader);
      if (Number.isInteger(remaining)) setFreeGenerationsRemaining(remaining);
    }
    const response = await readAiImageResponse(res);
    const committed = applyResponse(runId, response);
    if (committed && settings.autoSaveAiEnabled) {
      await autoSaveImages(committed.committedBlob, exported.preview, runId);
    }
  } catch (err) {
    if (!isAiGenerationActive(runId)) return;
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    failAiGeneration(
      runId,
      timedOut ? AI_TIMEOUT_MESSAGE : undefined,
      timedOut ? 'retry' : 'generic'
    );
    console.error(err);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    endAiGeneration(runId);
  }
}
