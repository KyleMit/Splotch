// The store-screenshot page copy: one entry per marketing screenshot, shared
// by the /dev/store-frames harness and tools/marketing-assets/
// gen-store-assets.mjs (which imports this under
// `node --experimental-strip-types` — relative imports only).

import { paletteHex } from '../../../../lib/palette.ts';

export const STORE_PAGE_IDS = ['01-draw', '02-books', '03-magic', '04-ai', '05-parents'] as const;
export type StorePageId = (typeof STORE_PAGE_IDS)[number];

export interface StoreChip {
  label: string;
  color: string;
}

export interface StorePage {
  id: StorePageId;
  // Rendered as HTML so a title can carry an explicit <br> line break.
  title: string;
  sub: string;
  logo?: boolean;
  chips?: readonly StoreChip[];
  showcase?: boolean;
  dark?: boolean;
}

export const STORE_PAGES: readonly StorePage[] = [
  {
    id: '01-draw',
    title: 'Just open and draw',
    sub: 'Big, chunky strokes made for little hands',
    logo: true,
    chips: [
      { label: 'Ages 2+', color: paletteHex('Green') },
      { label: 'Works offline', color: paletteHex('Blue') },
      { label: 'Free & open source', color: paletteHex('Orange') },
    ],
  },
  {
    id: '02-books',
    title: '48 pages to color, in 8 little books',
    sub: 'Farm animals, dinosaurs, rockets, trucks, and more',
  },
  {
    id: '03-magic',
    title: 'Scribble free, or flip on the magic brush',
    sub: 'In magic mode, every happy swipe stays inside the lines',
  },
  {
    id: '04-ai',
    title: 'Turn a doodle into a masterpiece',
    // The old "a grown-up always holds the key" only made sense if you already
    // knew the AI flow is BYOK; this reads without that context.
    sub: 'Optional AI art — it stays off until a parent unlocks it',
    showcase: true,
  },
  {
    id: '05-parents',
    // Explicit break; "Nothing to buy" was dropped because BYOK is technically
    // a purchase. Sentence case per the design voice, not the handoff's
    // capitalized nouns.
    title: 'No accounts.<br>No ads. No tracking.',
    sub: 'Parents set the guardrails. Kids just draw.',
    dark: true,
  },
];

export function storePage(id: StorePageId): StorePage {
  const page = STORE_PAGES.find((entry) => entry.id === id);
  if (!page) throw new Error(`Unknown store page: ${id}`);
  return page;
}

// Every page except the composed AI showcase places a live app capture in its
// frame — the generator captures one, and the harness loads it from
// store-assets/captures/.
export const pageHasCapture = (page: StorePage): boolean => !page.showcase;
