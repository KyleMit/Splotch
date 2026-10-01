import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAGE_SHARE_CARDS,
  SHARE_CARD_SIZE,
} from '../../../web/src/lib/components/page/socialCard.ts';
import { ROOT } from '../../lib/proc.mjs';

const VISUAL_INPUT_FILES = [
  'tools/marketing-assets/gen-share-cards.mjs',
  'tools/marketing-assets/lib/share-card-inputs.mjs',
  'web/src/routes/dev/share-cards/+page.svelte',
  'web/src/routes/dev/share-cards/+page.server.ts',
  'web/src/routes/dev/share-cards/lib/ShareCard.svelte',
  'web/src/routes/+layout.svelte',
  'web/src/lib/components/CrayonStrip.svelte',
  'web/src/lib/components/SplotchyIcon.svelte',
  'web/src/lib/icons/splotchy.svg',
  'web/src/lib/assets/handmade-paper.webp',
  'web/src/lib/design/tokens.ts',
  'web/src/lib/palette.ts',
  'web/src/lib/fonts.ts',
  'web/src/app.css',
  'web/src/tokens.css',
  'node_modules/@fontsource-variable/quicksand/index.css',
  'node_modules/@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2',
  'node_modules/@fontsource-variable/quicksand/files/quicksand-latin-ext-wght-normal.woff2',
  'node_modules/@fontsource-variable/quicksand/files/quicksand-vietnamese-wght-normal.woff2',
];

export function shareCardInputHash() {
  const hash = createHash('sha256');
  const cards = Object.entries(PAGE_SHARE_CARDS).map(([path, { name, file }]) => ({
    path,
    name,
    file,
  }));
  hash.update(JSON.stringify({ cards, size: SHARE_CARD_SIZE }));
  for (const file of VISUAL_INPUT_FILES) {
    hash.update(file);
    hash.update(
      createHash('sha256')
        .update(readFileSync(join(ROOT, file)))
        .digest()
    );
  }
  return hash.digest('hex');
}
