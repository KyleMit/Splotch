import {
  ui,
  startAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult
} from '$lib/state/ui.svelte';
import { settings } from '$lib/state/settings.svelte';
import { apiUrl } from '$lib/api';
import { exportCanvasBlob } from './engine';
import { getActiveOverlayImage } from './overlay';
import { saveImageBlob } from './screenshot';

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
async function autoSaveImages(aiBlob: Blob, drawingBlob: Blob) {
  await saveImageBlob(aiBlob, 'splotch-ai');
  const sig = await blobSignature(drawingBlob);
  if (sig === null || sig !== lastSavedDrawingSig) {
    await saveImageBlob(drawingBlob, 'splotch');
  }
  lastSavedDrawingSig = sig;
}

const AI_TIMEOUT_MS = 120_000;

export async function generateAiImage(
  { blob = null, style = '' }: { blob?: Blob | null; style?: string } = {}
) {
  if (ui.aiGenerating) return;

  // Launch the loading modal the instant the button is tapped. When the caller
  // already has the drawing (the style picker hands us a blob), show it blurred
  // behind the dial straight away; otherwise open with the dial alone and slot
  // the preview in once the canvas export finishes — so the spinner never waits
  // on the export, even when customization is off and we skip the picker.
  startAiGeneration(blob ? URL.createObjectURL(blob) : null);

  const imageBlob =
    blob ?? (await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false }));
  if (!imageBlob) {
    closeAiResult();
    return;
  }
  if (!blob) setAiPreview(URL.createObjectURL(imageBlob));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const form = new FormData();
    // Prefer the parent's own Gemini key (BYOK); fall back to a managed access
    // token. The server uses whichever it receives — a key bills the parent's
    // Google account, a token uses ours.
    if (settings.aiUserApiKey) form.append('apiKey', settings.aiUserApiKey);
    else form.append('token', settings.aiAccessToken);
    form.append('image', imageBlob, 'drawing.png');
    if (style) form.append('style', style);

    const res = await fetch(apiUrl('/api/generate-image'), {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`AI image request failed (${res.status}): ${msg}`);
    }
    const outBlob = await res.blob();
    finishAiGeneration(URL.createObjectURL(outBlob));
    if (settings.autoSaveAiEnabled) await autoSaveImages(outBlob, imageBlob);
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    failAiGeneration(timedOut ? "That's taking too long — please try again." : undefined);
    console.error(err);
  } finally {
    clearTimeout(timeoutId);
  }
}
