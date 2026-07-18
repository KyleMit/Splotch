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

// The credentials ride in headers, not the query string: the managed access
// token and (especially) a parent's BYO Gemini key are secrets, and query
// strings leak into server/CDN access logs, browser history, and Referer
// headers. The non-secret style enum is a plain query param. See ADR-0064.
const ACCESS_TOKEN_HEADER = 'x-access-token';
const API_KEY_HEADER = 'x-api-key';

const contentTypeOf = (request: Request) =>
  (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();

const asString = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' ? value : null;

interface GenerationRequest {
  token: string | null;
  apiKey: string | null;
  style: string | null;
  // Deferred so the ≤15 MB body isn't buffered until authorization succeeds — an
  // unauthorized request never costs us the read. (The multipart shape has
  // already buffered by necessity; only the raw path actually saves the read.)
  readImage: () => Promise<{ bytes: Buffer; mimeType: string }>;
}

// Two request shapes are accepted (ADR-0064):
//   • raw body  — the current contract: image bytes as the body, credentials in
//                 headers, style in the query string. One arrayBuffer read, no
//                 multipart parse or copy.
//   • multipart — the legacy contract (token/apiKey/image/style form fields).
//                 Shipped native builds and PWA clients on a stale service worker
//                 predate the raw-body switch and still send this; native apps
//                 can't be updated in lockstep with a server deploy, so we keep
//                 accepting it rather than 403 them for missing credential
//                 headers. Remove this branch once the oldest supported client
//                 sends the raw body.
async function readGenerationRequest(request: Request, url: URL): Promise<GenerationRequest> {
  if (contentTypeOf(request) === 'multipart/form-data') {
    // Credentials live in the body here, so the whole envelope is buffered and
    // parsed up front — the cost the raw path exists to skip.
    const form = await request.formData();
    const imageFile = form.get('image');
    return {
      token: asString(form.get('token')),
      apiKey: asString(form.get('apiKey')),
      style: asString(form.get('style')),
      readImage: async () => {
        if (!(imageFile instanceof Blob)) throw error(400, 'Missing image');
        if (imageFile.size > MAX_IMAGE_BYTES) throw error(413, 'Image is too large');
        return { bytes: Buffer.from(await imageFile.arrayBuffer()), mimeType: imageFile.type };
      },
    };
  }
  return {
    token: request.headers.get(ACCESS_TOKEN_HEADER),
    apiKey: request.headers.get(API_KEY_HEADER),
    style: url.searchParams.get('style'),
    readImage: async () => {
      // Reject an oversized body before buffering it. Content-Length can be
      // absent or wrong, so the byte length is re-checked after the read.
      const declaredLength = Number(request.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        throw error(413, 'Image is too large');
      }
      // Buffer.from(ArrayBuffer) wraps without copying (unlike the TypedArray
      // overload), so the upload is only held in memory once.
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.byteLength === 0) throw error(400, 'Missing image');
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw error(413, 'Image is too large');
      return { bytes, mimeType: contentTypeOf(request) };
    },
  };
}

export const POST: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const source = await readGenerationRequest(request, url);

  const authorization = await authorizeGenerationRequest({
    apiKey: source.apiKey,
    token: source.token,
    clientAddress: getClientAddress(),
  });
  if (authorization instanceof Response) return authorization;

  const { bytes: inputBytes, mimeType } = await source.readImage();
  // An empty type is fine (default to PNG below); only reject a type that's
  // present and not on the allowlist.
  if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw error(415, 'Unsupported image type');
  }
  const style = source.style;
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

  const inputBase64 = inputBytes.toString('base64');

  const result = await aiProvider.generateImage({
    apiKey: effectiveKey,
    image: { base64: inputBase64, mimeType: mimeType || 'image/png' },
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
