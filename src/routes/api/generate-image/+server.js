import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';
import { getStore } from '@netlify/blobs';
import { STYLE_SUFFIXES } from '$lib/ai/styles.js';
import { isAllowedToken } from '$lib/server/tokens.js';

/**
 * Record that a token generated an image, so we can spot a token going rogue.
 * Logs to the Netlify function log (real-time) and keeps a durable per-token
 * tally in Netlify Blobs (dashboard → Blobs → "ai-usage") that we can audit
 * later and use to decide which token to pull from ALLOWED_TOKENS_LIST.
 */
// Show only the last 4 chars of a token in logs — the full secret should never
// land in the function log or any downstream log drain.
function maskToken(token) {
  const t = String(token ?? '');
  return t.length <= 4 ? '****' : `…${t.slice(-4)}`;
}

async function recordUsage(token, { style, prompt }) {
  const now = new Date().toISOString();
  console.log(`[ai-usage] token=${maskToken(token)} style=${style || 'none'} prompt=${JSON.stringify(prompt)} at=${now}`);

  try {
    const store = getStore('ai-usage');
    const prev = (await store.get(token, { type: 'json' })) || {};
    await store.setJSON(token, {
      count: (prev.count || 0) + 1,
      firstUsed: prev.firstUsed || now,
      lastUsed: now,
      lastStyle: style || null,
      lastPrompt: prompt
    });
  } catch (err) {
    // Blobs is only wired up in the Netlify runtime; don't fail the request
    // (e.g. during local `vite dev`) just because usage couldn't be persisted.
    console.warn('[ai-usage] failed to persist usage to Netlify Blobs:', err?.message ?? err);
  }
}

const MODEL = 'gemini-2.5-flash-image';
// A drawing screenshot is well under a megabyte; cap the upload so a valid-token
// holder can't push us into a memory/DoS situation by base64-ing a huge blob.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";

export async function POST({ request, platform }) {
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

  const suffix =
    typeof style === 'string' && Object.hasOwn(STYLE_SUFFIXES, style)
      ? STYLE_SUFFIXES[style]
      : '';
  const finalPrompt = suffix ? DEFAULT_PROMPT + ' ' + suffix : DEFAULT_PROMPT;

  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (usingByok) {
    console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
  } else {
    // The synchronous audit log inside recordUsage runs immediately; only the
    // Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordUsage(token, { style, prompt: finalPrompt });
    if (platform?.context?.waitUntil) platform.context.waitUntil(usage);
  }

  const inputBytes = new Uint8Array(await imageFile.arrayBuffer());
  const inputBase64 = Buffer.from(inputBytes).toString('base64');

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: imageFile.type || 'image/png', data: inputBase64 } },
            { text: finalPrompt }
          ]
        }
      ]
    });
  } catch (err) {
    console.error('Gemini call failed:', err);
    throw error(502, `Gemini request failed: ${err?.message ?? String(err)}`);
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const textPart = parts.find((p) => typeof p.text === 'string');
    const reason = textPart?.text || response?.candidates?.[0]?.finishReason || 'no image part returned';
    throw error(502, `Model did not return an image: ${reason}`);
  }

  const outBytes = Buffer.from(imagePart.inlineData.data, 'base64');
  return new Response(outBytes, {
    headers: {
      'Content-Type': imagePart.inlineData.mimeType || 'image/png',
      'Cache-Control': 'no-store'
    }
  });
}
