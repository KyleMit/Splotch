// @vitest-environment node
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  coloringPacksState,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
} from '$lib/state/coloringPacks.svelte';

import ColoringSection from './ColoringSection.svelte';

const MANIFEST_BOOK_COUNT = 8;

// Whitespace is compared as rendered, not normalized: a formatter wrapping the
// copy across template lines leaves a newline run in the text node, which a
// regex text locator anchored on the copy (coloring-pack-download-gate.spec.ts)
// no longer matches.
function textOf(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '');
}

function storageSummary() {
  const body = render(ColoringSection).body;
  const summary = /<div class="pack-summary[^"]*">([\s\S]*?)<\/div>\s*<\/div>/.exec(body)?.[1];
  const lines = [...(summary ?? '').matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((match) =>
    textOf(match[1])
  );
  const beforeRemoveLabel = body.slice(0, body.indexOf('Remove downloaded pictures'));
  const removeTag = /<button[^>]*>(?![\s\S]*<button)/.exec(beforeRemoveLabel)?.[0] ?? '';
  return { lines, removeDisabled: /\sdisabled(?:[\s=>])/.test(removeTag) };
}

function installExtraBooks(bookIds: string[], downloadedBytes: number) {
  setInstalledColoringBooks(bookIds);
  coloringPacksState.recordInstalledPacks(MANIFEST_BOOK_COUNT, downloadedBytes);
}

beforeEach(() => {
  resetDownloadedColoringBooks();
});

// The starter book ships with the app, so every count here is of the extra
// books a parent can download; the copy is pinned word for word.
describe('ColoringSection downloaded-pictures summary', () => {
  it('counts no extra books before any download and cannot remove anything', () => {
    installExtraBooks([], 0);

    expect(storageSummary()).toEqual({
      lines: ['0 of 7 extra books · 0.0 MB'],
      removeDisabled: true,
    });
  });

  it('counts the extra books on disk, not the starter book', () => {
    installExtraBooks(['farm', 'dinosaur'], 1_250_000);

    expect(storageSummary()).toEqual({
      lines: ['1 of 7 extra books · 1.3 MB'],
      removeDisabled: false,
    });
  });

  it('names the book downloading in the background', () => {
    installExtraBooks(['dinosaur', 'space'], 2_500_000);
    coloringPacksState.startBookDownload('vehicles');

    try {
      expect(storageSummary()).toEqual({
        lines: ['2 of 7 extra books · 2.5 MB', 'Downloading Vehicles in the background'],
        removeDisabled: false,
      });
    } finally {
      coloringPacksState.endBookDownload();
    }
  });

  it('says every book is ready once all the extra books are downloaded', () => {
    installExtraBooks(
      ['dinosaur', 'creatures', 'nature', 'objects', 'shapes', 'space', 'vehicles'],
      12_340_000
    );

    expect(storageSummary()).toEqual({
      lines: ['7 of 7 extra books · 12.3 MB', 'Every coloring book is ready offline'],
      removeDisabled: false,
    });
  });
});
