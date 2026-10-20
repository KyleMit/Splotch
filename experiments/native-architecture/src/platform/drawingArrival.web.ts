import { readDrawingVisitedFlag } from '../../../../web/src/lib/components/page/backLabel';

// Shipping's pages read the drawing route's session flag beside the referrer (BackLink.svelte), so
// a page reloaded, or a mistyped path loaded, after the drawing ran in this tab still offers the
// way back to it.
export function drawingArrival() {
  return {
    sessionFlag: readDrawingVisitedFlag(() => sessionStorage),
    referrer: document.referrer,
    origin: location.origin,
  };
}
