import {
  APP_PAGE_DOCUMENTS,
  APP_PAGE_PATHS,
  isAppPage,
  type AppPage,
  type DocumentPage,
} from '../information/appPages';
import { APP_DOCUMENT_ATTRIBUTE } from './appDocumentContract';

function isDocumentPage(value: string | null): value is DocumentPage {
  return value !== null && isAppPage(value) && APP_PAGE_DOCUMENTS[value].document === 'page';
}

// What the build's page render (pageDocument/prerender.tsx) renders, which a Node render cannot
// read from a document.
export const pageDocumentInputs: { page: DocumentPage | null } = { page: null };

// The page this page document shows: the one the build renders, or the one its document names.
export function documentPage(): DocumentPage | null {
  if (typeof document === 'undefined') return pageDocumentInputs.page;
  const named = document.documentElement.getAttribute(APP_DOCUMENT_ATTRIBUTE);
  return isDocumentPage(named) ? named : null;
}

type OpenAppPage = (page: AppPage, fragment?: string) => void;

// A page document holds one page: its own fragments open in place, and every other page, the
// drawing screen included, loads its own document.
export function crossDocumentNavigation(
  host: DocumentPage,
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
