import { createLazyExport } from '../lazyExport';

const resource = createLazyExport(() => import('./pageArtChunk.web'));
export function pageArt() {
  return resource;
}
