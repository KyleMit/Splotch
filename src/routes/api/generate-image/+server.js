import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';
import { getStore } from '@netlify/blobs';
import { STYLE_SUFFIXES } from '$lib/ai/styles.js';

const rawTokens = env.ALLOWED_TOKENS_LIST || '';
const tokenArray = rawTokens.split(',').map(t => t.trim());
const ALLOWED_TOKENS = new Set(tokenArray);

/**
 * Record that a token generated an image, so we can spot a token going rogue.
 * Logs to the Netlify function log (real-time) and keeps a durable per-token
 * tally in Netlify Blobs (dashboard → Blobs → "ai-usage") that we can audit
 * later and use to decide which token to pull from ALLOWED_TOKENS_LIST.
 */
async function recordUsage(token, { style, prompt }) {
  const now = new Date().toISOString();
  console.log(`[ai-usage] token=${token} style=${style || 'none'} prompt=${JSON.stringify(prompt)} at=${now}`);

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
const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";

export async function POST({ request }) {
  const form = await request.formData();
  const token = form.get('token');
  const imageFile = form.get('image');
  const style = form.get('style');

  if (typeof token !== 'string' || !ALLOWED_TOKENS.has(token)) {
    throw error(403, 'Invalid access token');
  }
  if (!(imageFile instanceof Blob)) {
    throw error(400, 'Missing image');
  }
  if (!env.GEMINI_API_KEY) {
    throw error(500, 'Server is missing GEMINI_API_KEY');
  }

  const suffix =
    typeof style === 'string' && Object.hasOwn(STYLE_SUFFIXES, style)
      ? STYLE_SUFFIXES[style]
      : '';
  const finalPrompt = suffix ? DEFAULT_PROMPT + ' ' + suffix : DEFAULT_PROMPT;

  await recordUsage(token, { style, prompt: finalPrompt });

  const inputBytes = new Uint8Array(await imageFile.arrayBuffer());
  const inputBase64 = Buffer.from(inputBytes).toString('base64');

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
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
