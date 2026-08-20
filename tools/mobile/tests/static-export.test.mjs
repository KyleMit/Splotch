import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nativeUnusedLineArt } from '../../lib/coloring-book-assets.mjs';
import { WEB_ONLY_STATIC_FILES, stripWebOnlyHeadTags } from '../lib/static-export.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const appHtml = readFileSync(join(repoRoot, 'web/src/app.html'), 'utf8');

describe('WEB_ONLY_STATIC_FILES', () => {
  it('lists only files that exist in the static tree', () => {
    for (const file of WEB_ONLY_STATIC_FILES) {
      expect(() => readFileSync(join(repoRoot, 'web/static', file)), file).not.toThrow();
    }
  });
});

describe('stripWebOnlyHeadTags', () => {
  // app.html is the template every prerendered page's head comes from, so a tag
  // added there is the realistic input — including the absolute-URL social-card
  // meta, which a naive path match would miss.
  const stripped = stripWebOnlyHeadTags(appHtml);

  it('removes every tag referencing a stripped file', () => {
    for (const file of WEB_ONLY_STATIC_FILES) {
      const basename = file.slice(file.lastIndexOf('/') + 1);
      expect(stripped, basename).not.toContain(basename);
    }
  });

  it('removes the whole social-card block, including tags that name no file', () => {
    expect(appHtml).toContain('og:image:width');
    expect(stripped).not.toContain('og:');
    expect(stripped).not.toContain('twitter:');
  });

  it('keeps the tags the native WebView still needs', () => {
    expect(stripped).toContain('name="viewport"');
    expect(stripped).toContain('name="theme-color"');
    expect(stripped).toContain('%sveltekit.head%');
  });

  it('leaves the pre-hydration boot script untouched', () => {
    const bootScript = (html) => html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(bootScript(stripped)).toBe(bootScript(appHtml));
  });

  it('is a no-op on markup with nothing to strip', () => {
    const html = '<link rel="stylesheet" href="/app.css" />\n<meta charset="UTF-8" />\n';
    expect(stripWebOnlyHeadTags(html)).toBe(html);
  });
});

describe('nativeUnusedLineArt', () => {
  it('strips opaque sources only for books shipped on mobile', () => {
    const mobile = {
      cover: '/coloring/mobile/cover.outline.webp',
      platforms: ['mobile'],
      pages: [
        {
          images: {
            portrait: '/coloring/mobile/page-tall.overlay.svg',
            landscape: '/coloring/mobile/page-wide.overlay.svg',
          },
          chalkImages: { portrait: '/coloring/mobile/page-tall.dark.overlay.svg' },
        },
      ],
    };
    const web = { ...mobile, cover: '/coloring/web/cover.outline.webp', platforms: ['web'] };

    expect(nativeUnusedLineArt([mobile, web])).toEqual([
      '/coloring/mobile/cover.outline.webp',
      '/coloring/mobile/page-tall.overlay.svg',
      '/coloring/mobile/page-wide.overlay.svg',
      '/coloring/mobile/page-tall.dark.overlay.svg',
    ]);
  });
});
