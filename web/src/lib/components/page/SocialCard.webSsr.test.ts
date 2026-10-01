import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SocialCard from './SocialCard.svelte';
import {
  PAGE_SHARE_CARDS,
  SHARE_CARD_SIZE,
  shareImageFor,
  isPageShareCardPath,
} from './socialCard';

describe('server-rendered page previews', () => {
  for (const path of Object.keys(PAGE_SHARE_CARDS)) {
    it(`${path} sends the card to scrapers without hydration`, () => {
      if (!isPageShareCardPath(path)) throw new Error('Invalid card fixture');
      const { head } = render(SocialCard, {
        props: {
          path,
          title: `Splotch ${PAGE_SHARE_CARDS[path].name}`,
          description: 'Page description',
        },
      });
      const image = shareImageFor(path);
      expect(head).toContain(`property="og:image" content="${image.url}"`);
      expect(head).toContain(`property="og:image:width" content="${SHARE_CARD_SIZE.width}"`);
      expect(head).toContain(`property="og:image:height" content="${SHARE_CARD_SIZE.height}"`);
      expect(head).toContain(`property="og:image:alt" content="${image.alt}"`);
      expect(head).toContain(`name="twitter:image" content="${image.url}"`);
      expect(head).toContain(`name="twitter:image:alt" content="${image.alt}"`);
    });
  }
});
