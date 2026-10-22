import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_SHARE_CARDS, SHARE_CARD_SIZE } from '../lib/page/socialCard.ts';
import { STORE_PAGES } from '../lib/storeFrames/pages.ts';
import { STORE_TARGETS } from '../lib/storeFrames/targets.ts';
import {
  SHARE_CARD_FILES,
  shareCardDocument,
  shareCardProblems,
} from '../lib/share-card-document.mjs';
import {
  featureGraphicDocument,
  storeFrameDocument,
  storeFrameFiles,
} from '../lib/store-frame-document.mjs';

// Every file a document names, by the attribute or url() that names it.
function referencedPaths(html) {
  return [...html.matchAll(/(?:src|href)="([^"]+)"|url\('([^']+)'\)/g)].map(
    ([, attribute, url]) => attribute ?? url
  );
}

function expectSelfContained(html, files) {
  const named = referencedPaths(html);
  expect(named.length).toBeGreaterThan(0);
  for (const path of named) expect(Object.keys(files), path).toContain(path);
  expect(html).toContain('<meta name="robots" content="noindex">');
  // Store art and link previews look the same whatever theme renders them.
  expect(html).not.toMatch(/prefers-color-scheme|data-theme/);
}

describe('share-card documents', () => {
  it('map every file to a repo file that exists', () => {
    for (const file of Object.values(SHARE_CARD_FILES)) expect(existsSync(file), file).toBe(true);
  });

  for (const [path, card] of Object.entries(PAGE_SHARE_CARDS)) {
    it(`${path} names its page and only its own files`, () => {
      const html = shareCardDocument(path);
      expectSelfContained(html, SHARE_CARD_FILES);
      expect(html).toContain(`<h1><span>${card.name}</span></h1>`);
      expect(html).toContain(`width:${SHARE_CARD_SIZE.width}px;height:${SHARE_CARD_SIZE.height}px`);
    });
  }

  it.each(['', '/unknown', '/privacy/', '__proto__', '/'])('refuses path %j', (path) => {
    expect(() => shareCardDocument(path)).toThrow('No share card for');
  });

  const card = PAGE_SHARE_CARDS['/privacy'];
  const filled = {
    title: card.name,
    card: { x: 0, y: 0, ...SHARE_CARD_SIZE },
    page: { ...SHARE_CARD_SIZE },
  };

  it('accepts a card that fills the image and names its page', () => {
    expect(shareCardProblems(card, filled)).toEqual([]);
  });

  it.each([
    ['another title', { ...filled, title: 'Beta' }, 'headed "Beta"'],
    ['a short card', { ...filled, card: { ...filled.card, height: 600 } }, 'card box'],
    ['an overflowing document', { ...filled, page: { width: 1200, height: 640 } }, '1200×640'],
  ])('rejects %s', (_case, read, problem) => {
    expect(shareCardProblems(card, read).join('; ')).toContain(problem);
  });
});

describe('store-frame documents', () => {
  const files = storeFrameFiles();

  it('map every file to a repo file that exists', () => {
    for (const file of Object.values(files)) expect(existsSync(file), file).toBe(true);
  });

  for (const target of STORE_TARGETS)
    for (const page of STORE_PAGES)
      it(`${target.name}/${page.id} is the slot's size and names only its own files`, () => {
        const html = storeFrameDocument(target.name, page.id);
        expectSelfContained(html, files);
        expect(html).toContain(`width:${target.width}px;height:${target.height}px`);
        expect(html).toContain(`<h1>${page.title}</h1>`);
      });

  it('lays out the feature graphic from its own files', () => {
    expectSelfContained(featureGraphicDocument(), files);
  });

  it.each([
    ['tablet7', '01-draw', 'Unknown store target "tablet7"'],
    ['phone', '06-more', 'Unknown store page "06-more"'],
  ])('refuses %s/%s', (target, page, message) => {
    expect(() => storeFrameDocument(target, page)).toThrow(message);
  });
});
