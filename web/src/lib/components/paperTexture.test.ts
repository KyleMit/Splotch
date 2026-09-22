import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAPER_TEXTURE_URL } from './DrawingCanvas.svelte';

// CSS url() sites and the lazily loaded export compositor cannot import the
// constant (a stylesheet has no imports; exportDrawing.ts must stay off the
// startup bundle, issue #461), so each carries the literal and this pins them
// to the one the route head preloads.
const LITERAL_SITES = [
  'src/lib/components/DrawingCanvas.svelte',
  'src/lib/components/BareToolbarPaper.svelte',
  'src/lib/drawing/exportDrawing.ts',
  'src/app.css',
];

describe('paper texture url', () => {
  for (const site of LITERAL_SITES) {
    it(`${site} references the preloaded texture`, () => {
      // Vitest runs with cwd = web/; a `new URL(…, import.meta.url)` template
      // would be rewritten by Vite into an asset glob and resolve to nothing.
      const source = readFileSync(resolve(process.cwd(), site), 'utf8');
      expect(source).toContain(PAPER_TEXTURE_URL);
      const textureUrls = source.match(/\/icons\/[\w-]+\.webp/g) ?? [];
      expect(textureUrls.every((url) => url === PAPER_TEXTURE_URL)).toBe(true);
    });
  }
});
