import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Dev-only: streams the sample artifacts (which live under tests/, outside
// Vite's static serving root) to the timer debug view so it never has to call
// Gemini. 404s outside dev — this must not ship.
const DIR = 'tests/artifacts';
const ALLOWED = new Set(['drawing-input.jpeg', 'ai-output.jpeg']);

export async function GET({ params }) {
  if (!dev) throw error(404, 'Not found');
  if (!ALLOWED.has(params.name)) throw error(404, 'Unknown artifact');

  const bytes = await readFile(join(process.cwd(), DIR, params.name));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }
  });
}
