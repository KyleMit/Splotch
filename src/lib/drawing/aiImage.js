import {
  ui,
  startAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult
} from '$lib/state/ui.svelte.js';
import { settings } from '$lib/state/settings.svelte.js';
import { exportCanvasBlob } from './engine.js';
import { getActiveOverlayImage } from './overlay.js';

export async function generateAiImage({ blob = null, style = '' } = {}) {
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

  try {
    const form = new FormData();
    form.append('token', settings.aiAccessToken);
    form.append('image', imageBlob, 'drawing.png');
    if (style) form.append('style', style);

    const res = await fetch('/api/generate-image', { method: 'POST', body: form });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`AI image request failed (${res.status}): ${msg}`);
    }
    const outBlob = await res.blob();
    finishAiGeneration(URL.createObjectURL(outBlob));
  } catch (err) {
    failAiGeneration();
    console.error(err);
  }
}
