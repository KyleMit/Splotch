import {
  ui,
  startAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult,
  isAiGenerationActive,
  endAiGeneration,
} from '$lib/state/ui.svelte';
import { settings } from '$lib/state/settings.svelte';
import { apiUrl } from '$lib/api';
import { exportCanvasBlob } from './engine';
import { readAiImageResponse } from './aiImageResponse';
import { getActiveOverlayImage } from './overlay';
import { saveImageBlob } from './screenshot';
import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';

const UPLOAD_WEBP_QUALITY = 0.85;

// Transcode the composited drawing to WebP for the upload only. Decoding the PNG
// and re-encoding is exact on the source pixels, so the model sees the same
// image at a fraction of the bytes. Returns null (caller falls back to the PNG)
// if the platform can't decode/encode or the encoder declines.
async function encodeWebpUpload(png: Blob): Promise<Blob | null> {
  try {
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

// Signature of the drawing saved on the previous AI run. Lets us skip re-saving
// the child's artwork when they re-roll a new style on an unchanged drawing —
// the AI image is always fresh, but the drawing copy would just be a duplicate.
let lastSavedDrawingSig: string | null = null;

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
async function autoSaveImages(aiBlob: Blob, drawingBlob: Blob, ownsRun: () => boolean) {
  if (!ownsRun()) return;
  await saveImageBlob(aiBlob, 'splotch-ai');
  if (!ownsRun()) return;
  const sig = await blobSignature(drawingBlob);
  if (!ownsRun()) return;
  if (sig === null || sig !== lastSavedDrawingSig) {
    await saveImageBlob(drawingBlob, 'splotch');
  }
  // Record the signature of the drawing we just saved even if ownership was lost
  // during that save: the drawing is already in the gallery, so a later owning run
  // on the same unchanged drawing must dedupe against it. Returning here (the old
  // post-save ownership check) left the signature stale and re-saved a duplicate.
  lastSavedDrawingSig = sig;
}

export async function generateAiImage({
  blob = null,
  style = '',
}: { blob?: Blob | null; style?: string } = {}) {
  if (ui.aiGenerating) return;

  const controller = new AbortController();

  // Launch the loading modal the instant the button is tapped. When the caller
  // already has the drawing (the style picker hands us a blob), show it blurred
  // behind the dial straight away; otherwise open with the dial alone and slot
  // the preview in once the canvas export finishes — so the spinner never waits
  // on the export, even when customization is off and we skip the picker.
  const runId = startAiGeneration(blob ? URL.createObjectURL(blob) : null, controller);
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

  try {
    const imageBlob =
      blob ?? (await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false }));
    if (!isAiGenerationActive(runId)) return;
    if (!imageBlob) {
      closeAiResult();
      return;
    }
    if (!blob) setAiPreview(runId, URL.createObjectURL(imageBlob));

    // Upload a high-quality WebP rather than the PNG: a flat-color toddler drawing
    // encodes to a fraction of the bytes, so the single buffered generate-image
    // function (ADR-0063) copies and base64s far less, and the smaller upload eats
    // less of the 26s budget. Lossy is a non-issue — the model reinterprets the
    // drawing anyway, and q0.85 is visually lossless on this input (issue #345). We
    // keep imageBlob (the pristine PNG) for the preview and the gallery auto-save,
    // and encode a throwaway WebP copy purely for the wire; if the platform can't
    // encode WebP we fall back to the PNG.
    const uploadBlob = (await encodeWebpUpload(imageBlob)) ?? imageBlob;

    // Send the raw image bytes as the body — no multipart envelope for the server
    // to buffer and parse (ADR-0064). Prefer the parent's own Gemini key (BYOK);
    // fall back to a managed access token. Both are secrets, so they ride in
    // headers, never the query string (which leaks into logs/history). The
    // non-secret style enum is a query param.
    const headers: Record<string, string> = {
      'Content-Type': uploadBlob.type || 'image/png',
    };
    if (settings.aiUserApiKey) headers['X-Api-Key'] = settings.aiUserApiKey;
    else headers['X-Access-Token'] = settings.aiAccessToken;

    const endpoint =
      apiUrl('/api/generate-image') + (style ? `?style=${encodeURIComponent(style)}` : '');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: uploadBlob,
      signal: controller.signal,
    });
    const response = await readAiImageResponse(res);
    switch (response.kind) {
      case 'safety':
        failAiGeneration(runId, "Let's try drawing something else!", 'safety');
        return;
      case 'throttled':
        failAiGeneration(runId, undefined, 'retry');
        console.error(
          `AI image request throttled (retry after ${response.retryAfter}s): ${response.detail}`
        );
        return;
      case 'error':
        // A 5xx is transient — an upstream Gemini failure or the server aborting
        // a too-slow call under Netlify's 26s ceiling (ADR-0063) — so offer the
        // same drawing again rather than a dead-end generic error. A 4xx (a
        // malformed/oversized request the client never actually sends) stays
        // generic.
        console.error(`AI image request failed (${response.status}): ${response.detail}`);
        failAiGeneration(runId, undefined, response.status >= 500 ? 'retry' : 'generic');
        return;
    }
    const outBlob = response.blob;
    const committed = finishAiGeneration(runId, URL.createObjectURL(outBlob));
    if (committed && settings.autoSaveAiEnabled) {
      await autoSaveImages(outBlob, imageBlob, () => isAiGenerationActive(runId));
    }
  } catch (err) {
    if (!isAiGenerationActive(runId)) return;
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    failAiGeneration(
      runId,
      timedOut ? "That's taking too long — please try again." : undefined,
      timedOut ? 'retry' : 'generic'
    );
    console.error(err);
  } finally {
    clearTimeout(timeoutId);
    endAiGeneration(runId);
  }
}
