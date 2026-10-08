import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const PAGE_PATH = 'web/src/routes/+page.svelte';
const EARLY_BOOT_IMPORT = "  import '$lib/drawing/earlyBoot';";
const BOTTOM_DOCK_OPEN = '<div class="bottom-dock">';
const ISLAND_IMPORT =
  "  import ProbeIsland from '../../../migration/probes/web-host/src/ProbeIsland.svelte';";
const ISLAND_MARKUP = '<ProbeIsland />';

export interface PageOverlayBinding {
  path: typeof PAGE_PATH;
  sourceSha256: string;
  transformedSha256: string;
}

function digest(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function oneAnchor(source: string, anchor: string): number {
  const index = source.indexOf(anchor);
  if (index === -1 || source.indexOf(anchor, index + anchor.length) !== -1)
    throw new Error(`Route overlay requires one exact anchor: ${anchor}`);
  return index;
}

export function overlayPageSource(source: string): {
  code: string;
  binding: PageOverlayBinding;
} {
  const boot = oneAnchor(source, EARLY_BOOT_IMPORT);
  const dock = oneAnchor(source, BOTTOM_DOCK_OPEN);
  if (boot >= dock || source.includes(ISLAND_IMPORT) || source.includes(ISLAND_MARKUP))
    throw new Error('Route overlay source already contains the island or changed anchor order');
  const withImport =
    source.slice(0, boot + EARLY_BOOT_IMPORT.length) +
    `\n${ISLAND_IMPORT}` +
    source.slice(boot + EARLY_BOOT_IMPORT.length);
  const markupIndex = oneAnchor(withImport, BOTTOM_DOCK_OPEN);
  const code =
    withImport.slice(0, markupIndex) + `${ISLAND_MARKUP}\n` + withImport.slice(markupIndex);
  return {
    code,
    binding: { path: PAGE_PATH, sourceSha256: digest(source), transformedSha256: digest(code) },
  };
}

export function pageOverlayPlugin(
  copyRoot: string,
  record: (binding: PageOverlayBinding) => void
): Plugin {
  const page = join(copyRoot, PAGE_PATH);
  if (realpathSync(page) !== page || !lstatSync(page).isFile() || lstatSync(page).nlink !== 1)
    throw new Error('Route overlay requires the canonical regular owned page source');
  return {
    name: 'splotch-neutral-page-overlay',
    enforce: 'pre',
    apply: 'build',
    load(id) {
      if (id !== page) return null;
      const result = overlayPageSource(readFileSync(page, 'utf8'));
      record(result.binding);
      return { code: result.code, map: null };
    },
  };
}
