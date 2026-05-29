import {
  ui,
  startAiGeneration,
  finishAiGeneration,
  failAiGeneration
} from '$lib/state/ui.svelte.js';
import { settings } from '$lib/state/settings.svelte.js';
import { exportCanvasBlob } from './engine.js';
import { getActiveOverlayImage } from './overlay.js';

export async function generateAiImage({ blob = null, style = '' } = {}) {
  if (ui.aiGenerating) return;
  const imageBlob =
    blob ?? (await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false }));
  if (!imageBlob) return;

  // Open the result modal right away in its loading state, showing the child's
  // own drawing (blurred) behind the progress dial while we wait.
  startAiGeneration(URL.createObjectURL(imageBlob));
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
