import {
  APP_PAGE_DOCUMENTS,
  APP_PAGE_PATHS,
  isAppPage,
  isDocumentOnlyPage,
  type AppPage,
  type DocumentPage,
} from '../information/appPages';
import { APP_DOCUMENT_ATTRIBUTE, NOT_FOUND_DOCUMENT } from './appDocumentContract';

// What a page document shows: a route-table page whose document is its own, or the not-found page
// a host answers every other path with.
export type DocumentContent = DocumentPage | typeof NOT_FOUND_DOCUMENT;

function isDocumentContent(value: string | null): value is DocumentContent {
  if (value === null) return false;
  if (value === NOT_FOUND_DOCUMENT || isDocumentOnlyPage(value)) return true;
  return isAppPage(value) && APP_PAGE_DOCUMENTS[value].document === 'page';
}

// What the build's page render (pageDocument/prerender.tsx) renders, which a Node render cannot
// read from a document.
export const pageDocumentInputs: { page: DocumentContent | null } = { page: null };

// The page this page document shows: the one the build renders, or the one its document names.
export function documentPage(): DocumentContent | null {
  if (typeof document === 'undefined') return pageDocumentInputs.page;
  const named = document.documentElement.getAttribute(APP_DOCUMENT_ATTRIBUTE);
  return isDocumentContent(named) ? named : null;
}

type OpenAppPage = (page: AppPage, fragment?: string) => void;

// A page document holds one page: its own fragments open in place, and every other page, the
// drawing screen included, loads its own document.
export function crossDocumentNavigation(
  host: DocumentContent,
  openInPlace: OpenAppPage,
  documentLocation: Pick<Location, 'assign'>
): OpenAppPage {
  return (page, fragment) => {
    if (page === host) {
      openInPlace(page, fragment);
      return;
    }
    const hash = fragment === undefined ? '' : `#${encodeURIComponent(fragment)}`;
    documentLocation.assign(`${APP_PAGE_PATHS[page]}${hash}`);
  };
}
