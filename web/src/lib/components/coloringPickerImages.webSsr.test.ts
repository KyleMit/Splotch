import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { BOOKS, COLORING_IMAGE_SIZES } from '$lib/state/books';
import ActivePageChip from './ActivePageChip.svelte';
import ColoringTile from './ColoringTile.svelte';

// The web build's side of coloringPickerImages.test.ts: this config compiles
// __IS_CAPACITOR__ false, so the picker hands the browser every responsive
// candidate and the slot size that picks among them.

const IMAGE = {
  src: '/coloring/farm/cover.webp',
  srcset: '/coloring/w320/farm/cover.webp 320w, /coloring/farm/cover.webp 1024w',
};
const TILE_SIZES = '(max-width: 520px) 50vw, 205px';

function renderedImageAttributes(html: string): Record<string, string> {
  const tag = /<img\b([^>]*)>/.exec(html)?.[1];
  if (tag === undefined) throw new Error('No <img> rendered');
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)]
      .filter(([, name]) => name !== 'class')
      .map(([, name, value]) => [name, value])
  );
}

describe('coloring picker images on the web', () => {
  it('gives a tile every responsive candidate and its slot size', () => {
    const { body } = render(ColoringTile, {
      props: {
        image: IMAGE,
        sizes: TILE_SIZES,
        shape: 'portrait',
        hoverArmed: false,
        retiring: false,
      },
    });

    expect(renderedImageAttributes(body)).toEqual({
      src: IMAGE.src,
      srcset: IMAGE.srcset,
      sizes: TILE_SIZES,
      alt: '',
      loading: 'lazy',
    });
  });

  it('gives the active page chip every responsive candidate and its slot size', () => {
    const { body } = render(ActivePageChip, {
      props: { page: BOOKS[0].pages[0], preview: IMAGE, hoverArmed: false, onclear: () => {} },
    });

    expect(renderedImageAttributes(body)).toEqual({
      src: IMAGE.src,
      srcset: IMAGE.srcset,
      sizes: COLORING_IMAGE_SIZES.activePageChip,
      alt: '',
    });
  });
});
