import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { STYLE_SUFFIXES } from '$lib/ai/styles';
import { buildPromptForStyle } from '$lib/ai/prompt';
import { isAllowedToken } from '$lib/server/tokens';
import { recordTokenUsage } from '$lib/server/usage';
import { rateLimit } from '$lib/server/rateLimit';
import { throttled } from '$lib/server/http';
import { aiProvider } from '$lib/server/ai/provider';
import type { RequestHandler } from './$types';

// A safety refusal is the model declining the drawing on policy grounds — the
// child should try a *different* drawing, not retry the same one. We surface it
// as a distinct 422 (vs 502 for genuine upstream failures) so the client can
// show the right guidance. See ADR-0023.
const SAFETY_STATUS = 422;
function safetyRefusal(reason: string): never {
  throw error(SAFETY_STATUS, `Drawing was blocked for safety: ${reason}`);
}

// Burst guardrail for managed (non-BYOK) tokens, which spend *our* model quota.
// A real generation takes several seconds, so back-to-back human use stays well
// under this; the cap only blunts a leaked token being hammered in a tight loop
// before we notice the usage tally and pull it. Per-instance like the verify
// limiters (resets on cold start) — a cost guardrail, not a hard boundary.
const GENERATE_LIMIT = 15;
const GENERATE_WINDOW_MS = 60_000;
// BYOK bills the parent's own Gemini quota, but any non-empty string flips the
// handler into this branch — unauthenticated, and 502-vs-200 leaks whether a
// key is valid, sidestepping /api/verify-key's limiter. Per the server-api rule
// that every unauthenticated oracle is rate-limited per IP, throttle it — just
// generously (double the managed cap, roomy for several families behind one
// NAT) so a valid key's use of its own quota is never the binding constraint.
const BYOK_LIMIT = 30;
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

  // Two ways in: the parent's own Gemini key (BYOK) bills their Google account
  // and skips the allowlist; otherwise a managed access token unlocks our key.
  const userKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const usingByok = userKey.length > 0;

  if (!usingByok && (typeof token !== 'string' || !(await isAllowedToken(token)))) {
    throw error(403, 'Invalid access token');
  }
  // Throttle valid managed tokens per token (so a leaked one can't be hammered
  // from many IPs to burn our quota) and BYOK per IP (see BYOK_LIMIT).
  const { limited, retryAfter } = usingByok
    ? rateLimit(`generate-image-byok:${getClientAddress()}`, {
        limit: BYOK_LIMIT,
        windowMs: GENERATE_WINDOW_MS,
      })
    : rateLimit(`generate-image:${token}`, {
        limit: GENERATE_LIMIT,
        windowMs: GENERATE_WINDOW_MS,
      });
  if (limited) return throttled(retryAfter);
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
  const effectiveKey = usingByok ? userKey : env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw error(500, 'Server is missing GEMINI_API_KEY');
  }

  const finalPrompt = buildPromptForStyle(style, STYLE_SUFFIXES);

  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (usingByok) {
    console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
  } else {
    // The synchronous audit log inside recordTokenUsage runs immediately; only
    // the Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordTokenUsage(token as string, {
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
