import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with cwd = web/; a `new URL(…, import.meta.url)` template would
// be rewritten by Vite into an asset glob and resolve to nothing.
const read = (path: string) => readFileSync(resolve(process.cwd(), path));

// The paper grain is inlined as a data URI (vite.config.ts,
// inlineStartupTextures) through one custom property declared in app.css.
// Every paper surface on the drawing route must paint from the property: a
// url() of the static file would fetch the same bytes again as a separate
// request, which is the LCP delay the inlining removes.
const PROPERTY_CONSUMERS = [
  'src/lib/components/DrawingCanvas.svelte',
  'src/lib/components/BareToolbarPaper.svelte',
  'src/lib/components/GlassPanes.svelte',
  'src/app.css',
];
const STATIC_URL = '/icons/handmade-paper.webp';

describe('paper texture', () => {
  it('ships the inlined copy and the static file as the same bytes', () => {
    expect(
      read('src/lib/assets/handmade-paper.webp').equals(read('static/icons/handmade-paper.webp'))
    ).toBe(true);
  });

  it('is declared once, globally, from the inlined asset', () => {
    const css = read('src/app.css').toString();
    const declarations = css.match(
      /--paper-texture:\s*url\('\$lib\/assets\/handmade-paper\.webp'\)/g
    );
    expect(declarations).toHaveLength(1);
    expect(read('src/routes/+page.svelte').toString()).not.toContain('--paper-texture:');
  });

  for (const site of PROPERTY_CONSUMERS) {
    it(`${site} paints from the property, never the static url`, () => {
      const source = read(site).toString();
      expect(source).toContain('var(--paper-texture)');
      expect(source).not.toContain(STATIC_URL);
    });
  }

  it('leaves the export compositor on the static file', () => {
    // exportDrawing.ts loads at save time, off the startup bundle (issue #461),
    // where a request for the cached static file is the cheaper form.
    expect(read('src/lib/drawing/exportDrawing.ts').toString()).toContain(STATIC_URL);
  });
});
