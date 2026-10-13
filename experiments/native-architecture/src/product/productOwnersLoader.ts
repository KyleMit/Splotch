import { createProductOwners } from './productOwners';
import type { LazyExport } from '../lazyExport';

// The native apps carry the owners in their one bundle, so useDrawingProduct creates them in the
// same effect as the product they report to; productOwnersLoader.web.ts loads them as a chunk.
export const productOwners: Pick<LazyExport<typeof createProductOwners>, 'current' | 'load'> = {
  current: () => createProductOwners,
  load: () => Promise.resolve(createProductOwners),
};
