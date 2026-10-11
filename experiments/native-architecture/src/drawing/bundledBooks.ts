export const STARTER_BOOK_ID = 'farm';
export const FARM_PAGE_IDS = [
  'farm/cat',
  'farm/cow',
  'farm/dog',
  'farm/duck',
  'farm/horse',
  'farm/pig',
] as const;
export type FarmPageId = (typeof FARM_PAGE_IDS)[number];
export type BookId = typeof STARTER_BOOK_ID;

export const BUNDLED_BOOKS = {
  farm: { label: 'Farm', pageIds: FARM_PAGE_IDS },
} as const satisfies Record<BookId, { label: string; pageIds: readonly FarmPageId[] }>;

export const BUNDLED_COLORING_PAGES = {
  'farm/cat': { label: 'Cat', paths: [] },
  'farm/cow': { label: 'Cow', paths: [] },
  'farm/dog': { label: 'Dog', paths: [] },
  'farm/duck': { label: 'Duck', paths: [] },
  'farm/horse': { label: 'Horse', paths: [] },
  'farm/pig': { label: 'Pig', paths: [] },
} as const satisfies Record<FarmPageId, { label: string; paths: readonly string[] }>;

export function isFarmPageId(value: unknown): value is FarmPageId {
  return FARM_PAGE_IDS.some((pageId) => pageId === value);
}
