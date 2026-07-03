import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireDevHarness } from '$lib/devHarness';
import type { RequestHandler } from './$types';

// Dev-only: streams the sample artifacts (which live under tests/, outside
// Vite's static serving root) to the timer debug view so it never has to call
// Gemini. Gated by the shared requireDevHarness() (same gate as the
// /dev/ai-timer page), so this 404s in production.
const DIR = 'tests/artifacts';
const ALLOWED = new Set(['drawing-input.jpeg', 'ai-output.jpeg']);

export const GET: RequestHandler = async ({ params }) => {
  requireDevHarness();
  if (!ALLOWED.has(params.name)) throw error(404, 'Unknown artifact');

  const bytes = await readFile(join(process.cwd(), DIR, params.name));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  });
};
