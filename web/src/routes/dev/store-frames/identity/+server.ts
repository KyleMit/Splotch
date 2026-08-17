import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { json } from '@sveltejs/kit';
import { requireDevHarness } from '$lib/devHarness';
import type { RequestHandler } from './$types';

// Answers "which checkout is this server serving?" for gen-store-assets'
// reuse check: an arbitrary responder on the preview port — a stale server or
// another worktree's — would otherwise render *its* frame components into
// this checkout's committed finals. Same cwd contract as the assets endpoint:
// dev and preview both run with cwd = web/, and everywhere else the
// dev-harness gate 404s first.
export const GET: RequestHandler = () => {
  requireDevHarness();
  return json({ repoRoot: realpathSync(join(process.cwd(), '..')) });
};
