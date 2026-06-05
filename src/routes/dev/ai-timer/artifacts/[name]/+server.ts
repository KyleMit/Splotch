import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

// Dev-only: streams the sample artifacts (which live under tests/, outside
// Vite's static serving root) to the timer debug view so it never has to call
// Gemini. Available in `vite dev`, and in a production `vite preview` build only
// when PUBLIC_ENABLE_DEV_HARNESS=true (the e2e webServer sets it; the Netlify
// deploy never does, so this 404s in production). Pairs with the same guard on
// the /dev/ai-timer page.
const DIR = 'tests/artifacts';
const ALLOWED = new Set(['drawing-input.jpeg', 'ai-output.jpeg']);

export const GET: RequestHandler = async ({ params }) => {
  if (!dev && env.PUBLIC_ENABLE_DEV_HARNESS !== 'true') throw error(404, 'Not found');
  if (!ALLOWED.has(params.name)) throw error(404, 'Unknown artifact');

  const bytes = await readFile(join(process.cwd(), DIR, params.name));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }
  });
}
