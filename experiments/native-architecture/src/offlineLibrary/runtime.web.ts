import { createDeferredLibrary } from './deferredLibrary';
import { pageLoaded } from '../platform/pageLoaded.web';

// The controller, its storage and transfer are about 33 KB, and its launch inventory fetches the
// coloring catalog (about 210 KB), none of which the first paint uses. The web export loads the
// controller when something needs it and takes the inventory once the page has loaded, so neither
// competes with the drawing screen's own first load (ADR-0179).
export const offlineLibrary = createDeferredLibrary(
  () => import('./fullLibrary').then((module) => module.createFullLibrary()),
  pageLoaded
);
