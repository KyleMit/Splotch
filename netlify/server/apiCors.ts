import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  ASYNC_GENERATION_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '../../src/lib/apiHeaders';
import {
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
} from '../../src/lib/ai/generationAttempt';

// The native apps load from a WebView origin (https://localhost on Android,
// capacitor://localhost on iOS) but call the hosted /api/* endpoints. Those are
// cross-origin requests, so the endpoints need permissive CORS. Credentialed
// routes authenticate each request; the unauthenticated free-generation path
// is bounded by its durable daily provider-start ceiling and per-IP rate limit.
// None of the APIs relies on cookies (the wildcard origin is incompatible with
// credentialed requests anyway). Only /api/* is opened up (ADR-0007): the
// endpoint functions stamp it through apiFunction, and hooks.server.ts stamps it
// on the /api/* answers SvelteKit still gives, the 404 for an unknown path.
export const API_CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  // Authorization: admin bearer sessions. X-Access-Token / X-Api-Key: the
  // generate-image credentials (secrets kept out of the query string).
  'Access-Control-Allow-Headers': `Content-Type, Authorization, ${ACCESS_TOKEN_HEADER}, ${API_KEY_HEADER}, ${ASYNC_GENERATION_HEADER}, ${INSTALLATION_ID_HEADER}, ${REPORT_TOKEN_HEADER}, ${RECOVERY_VERSION_HEADER}, ${RECOVERY_NONCE_HEADER}, ${RECOVERY_CREATED_HEADER}, ${RECOVERY_INPUT_DIGEST_HEADER}, ${RECOVERY_TERMINAL_HEADER}`,
  'Access-Control-Expose-Headers': `${FREE_GENERATIONS_REMAINING_HEADER}, ${REPORT_TOKEN_HEADER}, ${RECOVERY_VERSION_HEADER}, ${RECOVERY_EXPIRES_HEADER}, ${RECOVERY_DIGEST_HEADER}, ${RECOVERY_RECEIPT_HEADER}`,
  // Let native clients cache the preflight for a day instead of paying an
  // extra OPTIONS round trip on every cross-origin JSON request.
  'Access-Control-Max-Age': '86400',
};

// No /api/* response is worth a cache entry, and several carry a credential (the
// admin token list, a report token) or one installation's state. So `no-store`
// is the default rather than a per-route choice a new route can forget; a route
// that does want caching says so with its own Cache-Control, which this leaves
// alone. The OPTIONS preflight is cached through its Access-Control-Max-Age
// instead and never takes it.
export function applyApiCacheDefault(response: Response): void {
  if (!response.headers.has('cache-control')) {
    response.headers.set('cache-control', 'no-store');
  }
}
