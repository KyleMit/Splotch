import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { requireDevHarness } from '$lib/devHarness';
import { STORE_TARGETS } from '../../lib/targets.ts';
import { STORE_PAGES, pageHasCapture } from '../../lib/pages.ts';
import {
  AI_AFTER_ASSET_FILE,
  AI_BEFORE_ASSET_FILE,
  captureAssetFile,
  PLAY_ICON_ASSET_FILE,
} from '../../lib/paths.ts';
import type { RequestHandler } from './$types';

// Serves the harness's repo-file inputs — the committed app captures plus the
// AI-showcase pair and the Play icon — from a closed map, so the endpoint can
// never read outside it. Only meaningful under `vite dev`/`vite preview`,
// which both run with cwd = web/ (tools/run-web-tool.mjs,
// tools/lib/vite-server.mjs); everywhere else the dev-harness gate 404s
// before any path is touched.
const REPO_ROOT = join(process.cwd(), '..');

const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' };

const ASSET_FILES: Record<string, string> = {
  [AI_BEFORE_ASSET_FILE]: join(
    REPO_ROOT,
    'scrapbook',
    'model-eval',
    'prompt-adherence',
    'assets',
    'in__line__house-sun__wide.jpg'
  ),
  [AI_AFTER_ASSET_FILE]: join(
    REPO_ROOT,
    'scrapbook',
    'model-eval',
    'prompt-adherence',
    'assets',
    'line__house-sun__wide__overlay-rich__1.jpg'
  ),
  [PLAY_ICON_ASSET_FILE]: join(REPO_ROOT, 'store-assets', 'icon-512.png'),
};
for (const target of STORE_TARGETS) {
  for (const page of STORE_PAGES.filter(pageHasCapture)) {
    ASSET_FILES[captureAssetFile(target.name, page.id)] = join(
      REPO_ROOT,
      'store-assets',
      'captures',
      target.name,
      `${page.id}.png`
    );
  }
}

export const GET: RequestHandler = ({ params }) => {
  requireDevHarness();
  const path = ASSET_FILES[params.file];
  if (!path) throw error(404, `Unknown store-frame asset: ${params.file}`);
  if (!existsSync(path)) {
    throw error(404, `${params.file} is not generated yet — run npm run gen:store-assets`);
  }
  const extension = path.slice(path.lastIndexOf('.') + 1);
  return new Response(new Uint8Array(readFileSync(path)), {
    headers: {
      'content-type': CONTENT_TYPES[extension],
      // The gen script and dev iteration rewrite captures in place; a cached
      // stale capture would silently render into the next screenshot.
      'cache-control': 'no-store',
    },
  });
};
