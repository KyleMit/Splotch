import { error, json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';

// A cheap text model is enough to prove the key authenticates with Gemini —
// we only care that the request isn't rejected for bad credentials. (The image
// model used for generation lives on the same key, so a successful auth here
// means the key is good to go.)
const TEST_MODEL = 'gemini-2.5-flash';

/**
 * Confirm a parent-supplied Gemini API key actually works by making a tiny
 * live call. Body: { apiKey }. Returns { ok: true } on success, or
 * { ok: false, error } when the key can't authenticate.
 */
export async function POST({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }

  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) return json({ ok: false, error: 'No API key provided' });

  const ai = new GoogleGenAI({ apiKey });
  try {
    await ai.models.generateContent({
      model: TEST_MODEL,
      contents: 'ping',
      // Keep the probe as small as possible — no thinking, one output token.
      config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1 }
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.warn('[verify-key] key rejected by Gemini:', msg);
    return json({ ok: false, error: 'That key could not authenticate with Gemini.' });
  }

  return json({ ok: true });
}
