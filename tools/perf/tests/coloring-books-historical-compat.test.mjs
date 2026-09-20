import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';

import {
  COLORING_BOOK_INSTALL_STATE_EXPRESSION,
  assertPickerNeverOpened,
} from '../lib/coloring-books-ready.mjs';

describe('historical coloring compatibility against the parent harness', () => {
  it('recognizes an exact versioned marker in the selected historical pack cache', async () => {
    const markerPath = '/coloring/.installed/1.6.273/full/dinosaur';
    const manifest = {
      starterBookId: 'farm',
      books: ['farm', 'dinosaur'].map((id) => ({
        id,
        variants: {
          compact: { bytes: 1, files: [] },
          full: { bytes: 1, files: [] },
        },
      })),
    };
    const run = new Function(
      'fetch',
      'caches',
      'globalThis',
      `return ${COLORING_BOOK_INSTALL_STATE_EXPRESSION};`
    );
    const state = await run(
      async (path) => ({
        ok: true,
        json: async () => (path === '/version.json' ? { version: '1.6.273' } : manifest),
      }),
      {
        keys: async () => ['coloring-packs-v1-1.6.273-full'],
        open: async () => ({
          keys: async () => [{ url: `https://example.test${markerPath}` }],
          match: async () => ({
            text: async () => JSON.stringify({ id: 'dinosaur', bytes: 1, files: [] }),
          }),
        }),
      },
      { screen: { width: 1512, height: 982 }, devicePixelRatio: 2 }
    );
    expect(state).toEqual({ catalog: ['farm', 'dinosaur'], missing: [] });
  });

  it('permits a never-opened historical picker that pre-renders a tile', async () => {
    const window = new Window();
    window.document.body.innerHTML =
      '<dialog id="coloring-book-dialog"><button class="coloring-tile"></button></dialog>';
    window.__perfColoringPickerOpenWitness = {
      opened: false,
      checked: false,
      observer: { takeRecords: () => [], disconnect: () => {} },
    };
    const execute = async (script) =>
      new Function('window', 'document', script)(window, window.document);
    await expect(assertPickerNeverOpened(execute)).resolves.toBeUndefined();
  });
});
