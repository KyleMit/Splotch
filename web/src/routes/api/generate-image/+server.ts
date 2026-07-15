import { error } from '@sveltejs/kit';
import { STYLE_SUFFIXES } from '$lib/ai/styles';
import { buildPromptForStyle } from '$lib/ai/prompt';
import { recordTokenUsage } from '$lib/server/usage';
import { aiProvider } from '$lib/server/ai/provider';
import {
  authorizeGenerationRequest,
  requireEffectiveGenerationKey,
} from '$lib/server/generationAuthorization';
import type { RequestHandler } from './$types';

// A safety refusal is the model declining the drawing on policy grounds — the
// child should try a *different* drawing, not retry the same one. We surface it
// as a distinct 422 (vs 502 for genuine upstream failures) so the client can
// show the right guidance. See ADR-0023.
const SAFETY_STATUS = 422;
function safetyRefusal(reason: string): never {
  throw error(SAFETY_STATUS, `Drawing was blocked for safety: ${reason}`);
}

// A drawing screenshot is well under a megabyte; cap the upload so a valid-token
// holder can't push us into a memory/DoS situation by base64-ing a huge blob.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  const form = await request.formData();
  const token = form.get('token');
  const apiKey = form.get('apiKey');
  const imageFile = form.get('image');
  const style = form.get('style');

  const authorization = await authorizeGenerationRequest({
    apiKey,
    token,
    clientAddress: getClientAddress(),
  });
  if (authorization instanceof Response) return authorization;
  if (!(imageFile instanceof Blob)) {
    throw error(400, 'Missing image');
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw error(413, 'Image is too large');
  }
  // An empty type is fine (some Blobs arrive without one); only reject a type
  // that's present and not on the allowlist.
  if (imageFile.type && !ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
    throw error(415, 'Unsupported image type');
  }
  const effectiveKey = requireEffectiveGenerationKey(authorization);

  const finalPrompt = buildPromptForStyle(style, STYLE_SUFFIXES);

  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (authorization.usingByok) {
    console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
  } else {
    // The synchronous audit log inside recordTokenUsage runs immediately; only
    // the Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordTokenUsage(authorization.managedToken, {
      style: typeof style === 'string' ? style : null,
      prompt: finalPrompt,
    });
    platform?.context?.waitUntil?.(usage);
  }

  // Buffer.from(ArrayBuffer) wraps without copying (unlike the TypedArray
  // overload), so the ≤15 MB upload is only held in memory once.
  const inputBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');

  const result = await aiProvider.generateImage({
    apiKey: effectiveKey,
    image: { base64: inputBase64, mimeType: imageFile.type || 'image/png' },
    prompt: finalPrompt,
  });
  if (result.kind === 'refusal') safetyRefusal(result.reason);
  if (result.kind === 'error') throw error(502, result.reason);

  const outBytes = Buffer.from(result.data, 'base64');
  return new Response(outBytes, {
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'no-store',
    },
  });
};
