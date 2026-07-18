import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// TEMPORARY benchmark endpoint — measures Netlify's *real* deployed function
// envelope (sync timeout ceiling + buffered request-size limit) so the audit
// finding rests on measured numbers, not on the adapter output or the docs.
// This route MUST NOT be merged to main; it lives only on
// feature/netlify-timeout-benchmark. It's intentionally ungated (no dev-harness
// env) so the deploy preview can be probed without extra config.

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// GET /api/slowtest?ms=12000 → sleeps ms, then returns timing. If the platform
// kills the invocation first, the client never sees this body — it sees
// Netlify's own timeout error at the real ceiling instead.
export const GET: RequestHandler = async ({ url }) => {
  const start = Date.now();
  const ms = clamp(Number(url.searchParams.get('ms') ?? '0') || 0, 0, 60_000);
  await new Promise((r) => setTimeout(r, ms));
  return json({
    ok: true,
    requestedMs: ms,
    serverElapsedMs: Date.now() - start,
    at: new Date().toISOString(),
  });
};

// POST /api/slowtest → reports how many body bytes the handler actually
// received (optionally after sleeping ?ms=). If Netlify caps the buffered
// request before our code runs, receivedBytes falls short of what was sent, or
// the platform rejects it outright — either way we learn the real limit.
export const POST: RequestHandler = async ({ request, url }) => {
  const start = Date.now();
  const ms = clamp(Number(url.searchParams.get('ms') ?? '0') || 0, 0, 60_000);
  if (ms) await new Promise((r) => setTimeout(r, ms));
  const buf = await request.arrayBuffer();
  return json({
    ok: true,
    receivedBytes: buf.byteLength,
    requestedMs: ms,
    serverElapsedMs: Date.now() - start,
    at: new Date().toISOString(),
  });
};
