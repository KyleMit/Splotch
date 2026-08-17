// The harness's URL vocabulary — asset file names, the render route, and its
// query params — declared once for the components that request them, the
// assets/[...file] endpoint that serves them, and the generator
// (tools/marketing-assets/gen-store-assets.mjs, which imports this under
// `node --experimental-strip-types` — relative imports only).

import type { StoreTargetName } from './targets.ts';
import type { StorePageId } from './pages.ts';

export const STORE_FRAME_ASSET_BASE = '/dev/store-frames/assets';

// Identity probe for the generator's server-reuse check: proves which checkout
// a running server is serving before its renders overwrite committed finals.
export const STORE_FRAME_IDENTITY_PATH = '/dev/store-frames/identity';

export const captureAssetFile = (target: StoreTargetName, page: StorePageId) =>
  `captures/${target}/${page}.png`;

export const AI_BEFORE_ASSET_FILE = 'ai-before.jpg';
export const AI_AFTER_ASSET_FILE = 'ai-after.jpg';
export const PLAY_ICON_ASSET_FILE = 'icon-512.png';

export const assetUrl = (file: string) => `${STORE_FRAME_ASSET_BASE}/${file}`;

// The render page's non-target page param for the Play feature graphic.
export const FEATURE_GRAPHIC_PAGE_PARAM = 'feature-graphic';

// Root-relative URL of the bare render page the generator screenshots.
export function renderPath(
  page: StorePageId | typeof FEATURE_GRAPHIC_PAGE_PARAM,
  target?: StoreTargetName
): string {
  const params = new URLSearchParams({ page });
  if (target) params.set('target', target);
  return `/dev/store-frames/render?${params}`;
}
