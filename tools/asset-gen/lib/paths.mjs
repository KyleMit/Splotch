// Path + tree resolution for the asset-gen scripts, self-contained so this
// project doesn't reach back into scripts/lib/ (ADR-0053). The generators are
// producers for the app's committed assets: inputs and outputs both live under
// web/static/, and review scratch lands in the gitignored .coloring-samples*/.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tools/asset-gen/lib/ -> the asset-gen dir is one level up, the repo root three.
export const ASSET_GEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = join(ASSET_GEN_DIR, '..', '..');

export const WEB_STATIC = join(REPO_ROOT, 'web', 'static');
export const COLORING_DIR = join(WEB_STATIC, 'coloring');
export const STYLES_DIR = join(WEB_STATIC, 'styles');

// Gitignored review scratch — candidates, overlays, review sheets. Never shipped.
export const SAMPLES_DIR = join(REPO_ROOT, '.coloring-samples');
export const SAMPLES_DARK_DIR = join(REPO_ROOT, '.coloring-samples-dark');

export function fail(message) {
  console.error(message);
  process.exit(1);
}
