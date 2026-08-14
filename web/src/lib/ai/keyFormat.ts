// What a parent's own API key looks like, in one place.
//
// Two callers need this and neither may drag the other's dependencies in: the
// Settings field classifies what was typed (key or access code) before choosing
// an endpoint, and boot decides whether a key already on the device is still one
// this app can use. Kept dependency-free so the boot path doesn't pull the
// network helpers in behind it.

/**
 * OpenAI issues project keys (`sk-proj-…`), service-account keys
 * (`sk-svcacct-…`), and the older user keys (`sk-…`) — every one of them starts
 * with the same short prefix, so matching it covers all three without having to
 * track which shapes exist.
 */
const OPENAI_KEY_PREFIX = 'sk-';

/**
 * The prefixes Google issued: classic `AIza…` Standard keys and the `AQ.…` Auth
 * keys it switched to in 2026. Splotch no longer calls Gemini (ADR-0113), so
 * this vocabulary exists only to *recognise* such a key — a parent who set one
 * up before the migration, or who follows an old how-to, gets told exactly what
 * is wrong instead of a generic authentication failure.
 */
const GEMINI_KEY_PREFIXES = ['AIza', 'AQ.'] as const;

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(OPENAI_KEY_PREFIX);
}

export function looksLikeRetiredGeminiKey(value: string): boolean {
  return GEMINI_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}
