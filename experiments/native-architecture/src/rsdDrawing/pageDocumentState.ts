import { createContext, useContext, useSyncExternalStore } from 'react';
import {
  COLD_VISIT_LABEL,
  resolveBackLabel,
  type BackLabel,
} from '../../../../web/src/lib/components/page/backLabel';
import { DRAWING_ROUTE } from '../../../../web/src/lib/boot/appSurfaceRoute';
import type { AppPage } from '../information/appPages';
import { openAppPage } from '../platform/appPath';
import { drawingArrival } from '../platform/drawingArrival';

// What every information page shares about its prerendered document and its navigation, beside
// the frame constants in pageFrame.ts, which Node tools also read.

const NO_SUBSCRIPTION = () => () => {};

// True while React renders the markup a page document was prerendered with: the build's render and
// the browser's hydration of it, which must match. The next render, and every render a document
// never prerendered (the drawing screen's pages over the paper), reads false. What only a script
// can keep current (a relative date, a collapsed panel's rows) renders from it as the document
// should read before, or without, any script.
export function usePrerenderedMarkup() {
  return useSyncExternalStore(
    NO_SUBSCRIPTION,
    () => false,
    () => true
  );
}

export type OpenAppPage = (page: AppPage, fragment?: string) => void;

// A prerendered page document cannot know how its visitor arrived, so its render and hydration
// carry shipping's server-rendered cold-visit label and the next render takes the arrival's.
export function useBackLabel(drawingVisited: boolean): BackLabel {
  return useSyncExternalStore(
    NO_SUBSCRIPTION,
    () =>
      resolveBackLabel({ fromPath: drawingVisited ? DRAWING_ROUTE : null, ...drawingArrival() }),
    () => COLD_VISIT_LABEL
  );
}

// Where an information page's own links lead. In the drawing screen's document every page opens
// over the paper (platform/appPath); a page document provides one that loads any other page's
// document instead (pageDocument/PageDocument.tsx). The drawing screen reaches this module only
// through its information pages' lazy chunk, so it stays off the startup path.
export const PageNavigation = createContext<OpenAppPage>((...open) => openAppPage(...open));

export function usePageNavigation() {
  return useContext(PageNavigation);
}
