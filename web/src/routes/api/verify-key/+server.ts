import { json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { readJsonBody, throttled } from '$lib/server/http';
import { aiProvider } from '$lib/server/ai/provider';
import type { RequestHandler } from './$types';

/**
 * Confirm a parent-supplied Gemini API key actually works by making a tiny
 * live call. Body: { apiKey }. Returns { ok: true } on success, or
 * { ok: false, error } when the key can't authenticate.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // Same throttle as verify-access-code: a live model call per request makes
  // this worth guarding against rapid repeated probes from one client.
  const { limited, retryAfter } = rateLimit(`verify-key:${getClientAddress()}`);
  if (limited) return throttled(retryAfter);

  const body = await readJsonBody(request);
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) return json({ ok: false, error: 'No API key provided' });

  const check = await aiProvider.verifyKey(apiKey);
  if (!check.ok) {
    console.warn('[verify-key] key rejected:', check.reason);
    return json({ ok: false, error: 'That key could not authenticate with Gemini.' });
  }

  return json({ ok: true });
};
