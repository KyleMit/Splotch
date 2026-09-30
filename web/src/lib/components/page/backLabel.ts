import { DRAWING_ROUTE } from '$lib/boot/appSurfaceRoute';

// The drawing route stamps this sessionStorage flag on mount, so a standalone
// page can tell a parent who came from the canvas apart from a cold visit (a
// store listing, a search result, a shared link). Session-scoped on purpose:
// a new tab has drawn nothing yet. routes/+page.svelte writes the literal
// inline rather than importing it — a startup-path import of a module the
// standalone pages also load re-partitions the startup chunks
// (tests/startup-bundle.spec.ts) — and app.html.test.ts holds the two equal.
export const DRAWING_VISITED_SESSION_KEY = 'splotch-drawing-visited';
export const DRAWING_VISITED_FLAG = '1';

export type BackLabel = 'Back to drawing' | 'Start drawing';

// Cold visits are what these pages exist for, and the server can't see how a
// visitor arrived, so this is also the server-rendered label.
export const COLD_VISIT_LABEL: BackLabel = 'Start drawing';

interface Arrival {
  /** The pathname of the client-side navigation that opened this page, if any. */
  fromPath: string | null;
  sessionFlag: string | null;
  referrer: string;
  origin: string;
}

export function resolveBackLabel({ fromPath, sessionFlag, referrer, origin }: Arrival): BackLabel {
  const cameFromDrawing =
    fromPath === DRAWING_ROUTE ||
    sessionFlag === DRAWING_VISITED_FLAG ||
    isDrawingReferrer(referrer, origin);
  return cameFromDrawing ? 'Back to drawing' : COLD_VISIT_LABEL;
}

function isDrawingReferrer(referrer: string, origin: string): boolean {
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    return url.origin === origin && url.pathname === DRAWING_ROUTE;
  } catch {
    return false;
  }
}

// Some private modes and sandboxed WebViews throw from the window.sessionStorage
// getter itself, so the accessor runs inside the try. An unreadable flag is a
// cold visit.
export function readDrawingVisitedFlag(storage: () => Storage): string | null {
  try {
    return storage().getItem(DRAWING_VISITED_SESSION_KEY);
  } catch {
    return null;
  }
}
