import { createDeferredLibrary } from './deferredLibrary';
import { afterDrawingPaint } from '../product/afterDrawingPaint.web';

export const offlineLibrary = createDeferredLibrary(
  () => import('./createLibrary').then((module) => module.createLibrary()),
  afterDrawingPaint,
  () =>
    import('../platform/offlineLibraryStorage.web').then((module) =>
      module.hasColoringPackStorage()
    )
);
