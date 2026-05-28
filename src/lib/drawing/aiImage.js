import { ui, openAiResult } from '$lib/state/ui.svelte.js';
import { settings } from '$lib/state/settings.svelte.js';
import { exportCanvasBlob } from './engine.js';
import { getActiveOverlayImage } from './overlay.js';

export async function generateAiImage({ blob = null, prompt = '', style = '' } = {}) {
  if (ui.aiGenerating) return;
  const imageBlob =
    blob ?? (await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false }));
  if (!imageBlob) return;

  ui.aiGenerating = true;
  try {
    const form = new FormData();
    form.append('token', settings.aiAccessToken);
    form.append('image', imageBlob, 'drawing.png');
    if (prompt) form.append('prompt', prompt);
    if (style) form.append('style', style);

    const res = await fetch('/api/generate-image', { method: 'POST', body: form });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`AI image request failed (${res.status}): ${msg}`);
    }
    const outBlob = await res.blob();
    openAiResult(URL.createObjectURL(outBlob));
  } finally {
    ui.aiGenerating = false;
  }
}
