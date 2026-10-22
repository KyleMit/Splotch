import manifest from './catalog.generated.json';
import { parsePack, type Pack, type PackResolution } from './manifest';
import type { OfflineBookId } from './identity';
export * from './manifest';
export function catalogPack(id: OfflineBookId, resolution: PackResolution): Pack {
  const book = manifest.books.find((book) => book.id === id);
  if (!book || manifest.formatVersion !== 1)
    throw new Error('The coloring catalog is unavailable.');
  return parsePack({ id, ...book.variants[resolution] });
}
