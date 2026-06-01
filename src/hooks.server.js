// The native apps load from a WebView origin (https://localhost on Android,
// capacitor://localhost on iOS) but call the hosted /api/generate-image. That's
// a cross-origin request, so the endpoint needs permissive CORS. The route is
// already token-gated server-side, so allowing any origin here is safe — it
// can't be abused without a valid access token. Only /api/* is opened up; the
// rest of the site stays same-origin.
export async function handle({ event, resolve }) {
  const isApi = event.url.pathname.startsWith('/api/');

  // Answer the CORS preflight before hitting any route logic.
  if (isApi && event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const response = await resolve(event);

  if (isApi) {
    const headers = corsHeaders();
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }

  return response;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
