import { OFFLINE_BOOKS } from './books.generated';
const DIGEST = /^[a-f0-9]{64}$/;
export type OfflineBookId = (typeof OFFLINE_BOOKS)[number]['id'];
export type OfflinePageSlug = (typeof OFFLINE_BOOKS)[number]['pages'][number]['slug'];
export type OfflinePageId = `offline:${OfflineBookId}:${OfflinePageSlug}:${string}`;
export function isOfflineBookId(value: unknown): value is OfflineBookId {
  return OFFLINE_BOOKS.some((book) => book.id === value);
}
export function isOfflinePageId(value: unknown): value is OfflinePageId {
  if (typeof value !== 'string') return false;
  const [prefix, bookId, slug, revision, extra] = value.split(':');
  return (
    prefix === 'offline' &&
    extra === undefined &&
    DIGEST.test(revision ?? '') &&
    OFFLINE_BOOKS.some(
      (book) => book.id === bookId && book.pages.some((page) => page.slug === slug)
    )
  );
}
export function pageReference(id: OfflinePageId) {
  const [, bookId, slug, revision] = id.split(':');
  const book = OFFLINE_BOOKS.find((book) => book.id === bookId);
  const page = book?.pages.find((page) => page.slug === slug);
  if (!book || !page || !DIGEST.test(revision)) throw new Error('Invalid offline coloring page.');
  return { book, page, revision };
}
export function offlinePageId(
  pack: { id: OfflineBookId; revision: string },
  slug: OfflinePageSlug
): OfflinePageId {
  const id = `offline:${pack.id}:${slug}:${pack.revision}`;
  if (!isOfflinePageId(id)) throw new Error('Invalid offline coloring page.');
  return id;
}
