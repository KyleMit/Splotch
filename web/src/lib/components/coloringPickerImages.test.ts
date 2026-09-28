import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { BOOKS } from '$lib/state/books';
import { coloringImageRequest } from '$lib/state/coloringPicker.svelte';
import ActivePageChip from './ActivePageChip.svelte';
import ColoringTile from './ColoringTile.svelte';

// This suite compiles __IS_CAPACITOR__ true (vitest.config.ts), so it pins the
// native picker: the responsive tiers a srcset names are stripped from the
// native bundle (ADR-0045), and each image asks for its full-size src alone.
// coloringPickerImages.webSsr.test.ts pins the same components on the web.

const IMAGE = {
  src: '/coloring/farm/cover.webp',
  srcset: '/coloring/w320/farm/cover.webp 320w, /coloring/farm/cover.webp 1024w',
};
const TILE_SIZES = '(max-width: 520px) 50vw, 205px';

let mounted: ReturnType<typeof mount> | null = null;

function renderedImageAttributes(target: HTMLElement): Record<string, string | null> {
  flushSync();
  const img = target.querySelector('img');
  if (!img) throw new Error('No <img> rendered');
  return Object.fromEntries(
    img
      .getAttributeNames()
      .filter((name) => name !== 'class')
      .map((name) => [name, img.getAttribute(name)])
  );
}

function mountInto() {
  return document.body.appendChild(document.createElement('div'));
}

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
});

describe('coloring picker images on native', () => {
  it('gives a tile its full-size src alone', () => {
    const target = mountInto();
    mounted = mount(ColoringTile, {
      target,
      props: {
        image: IMAGE,
        sizes: TILE_SIZES,
        shape: 'portrait',
        hoverArmed: false,
        retiring: false,
      },
    });

    expect(renderedImageAttributes(target)).toEqual({ src: IMAGE.src, alt: '', loading: 'lazy' });
  });

  it('gives the active page chip its full-size src alone', () => {
    const target = mountInto();
    mounted = mount(ActivePageChip, {
      target,
      props: { page: BOOKS[0].pages[0], preview: IMAGE, hoverArmed: false, onclear: () => {} },
    });

    expect(renderedImageAttributes(target)).toEqual({ src: IMAGE.src, alt: '' });
  });

  it('prefetches the same full-size src a tile shows', () => {
    expect(coloringImageRequest(IMAGE, TILE_SIZES)).toBe(IMAGE.src);
  });
});
