export const INFORMATION_TOP_ID = 'top';

// The one route table, kept by column: every page's path, then how the web build writes it. The
// drawing screen reads only the path column, so tree shaking keeps the rest of the table off its
// startup path (check-native-web-startup.mjs). The paths, the worker's navigation routes and the
// documents the web build writes all derive from it (tools/migration/build-native-web.mjs).
export const APP_PAGE_PATHS = {
  drawing: '/',
  privacy: '/privacy',
  changelog: '/changelog',
  feedback: '/feedback',
} as const;
export type AppPage = keyof typeof APP_PAGE_PATHS;
export type AppLocation = AppPage | 'notFound';

type AppPageDocument = Readonly<{
  // 'ssg': the build prerenders this path's markup into its document; 'client': the document
  // renders it after its bundle loads.
  render: 'ssg' | 'client';
  // 'drawing': the drawing screen's document (index.html) serves this path and shows the page over
  // the paper. 'page': the build writes the page its own document (<page>.html), which the page
  // entry (src/pageDocument/) hydrates; opened from the drawing screen, it still shows over the
  // paper.
  document: 'drawing' | 'page';
}>;

// Pages only their own document shows. /beta explains how to install the native apps, so it is
// web-only: its store links and TestFlight invitation stay out of the native app (an App Review
// 2.3.10 rejection inside an iOS binary) and out of the drawing screen's bundle, which never reads
// this column and so answers these paths as not found.
export const DOCUMENT_ONLY_PAGE_PATHS = { beta: '/beta' } as const;
export type DocumentOnlyPage = keyof typeof DOCUMENT_ONLY_PAGE_PATHS;

export const APP_PAGE_DOCUMENTS = {
  drawing: { render: 'ssg', document: 'drawing' },
  privacy: { render: 'ssg', document: 'page' },
  changelog: { render: 'ssg', document: 'page' },
  feedback: { render: 'ssg', document: 'page' },
  beta: { render: 'ssg', document: 'page' },
} as const satisfies Record<AppPage, AppPageDocument> &
  Record<DocumentOnlyPage, { render: 'ssg'; document: 'page' }>;
type DocumentedPage = keyof typeof APP_PAGE_DOCUMENTS;
export type DocumentPage = {
  [Page in DocumentedPage]: (typeof APP_PAGE_DOCUMENTS)[Page]['document'] extends 'page'
    ? Page
    : never;
}[DocumentedPage];

export function isAppPage(value: string): value is AppPage {
  return Object.hasOwn(APP_PAGE_PATHS, value);
}

export function isDocumentOnlyPage(value: string): value is DocumentOnlyPage {
  return Object.hasOwn(DOCUMENT_ONLY_PAGE_PATHS, value);
}

// Where a page document's own page lives, by route-table page.
export function documentPagePath(page: DocumentPage) {
  return isDocumentOnlyPage(page) ? DOCUMENT_ONLY_PAGE_PATHS[page] : APP_PAGE_PATHS[page];
}

// The table's pages in lookup order: a page the table gains fails to compile until it is listed.
type AppPageOrder = readonly ['drawing', 'privacy', 'changelog', 'feedback'];
type Covering<Order extends readonly AppPage[]> =
  Exclude<AppPage, Order[number]> extends never ? Order : never;

export function appPageAt(path: string): AppLocation {
  if (path === '/index.html') return 'drawing';
  for (const page of [
    'drawing',
    'privacy',
    'changelog',
    'feedback',
  ] as const satisfies Covering<AppPageOrder>) {
    if (APP_PAGE_PATHS[page] === path) return page;
  }
  return 'notFound';
}

export function createAppPages() {
  let destination: { page: AppPage; fragment: string | null } = {
    page: 'drawing',
    fragment: null,
  };
  const listeners = new Set<() => void>();
  return {
    current: () => destination.page,
    fragment: () => destination.fragment,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(page: AppPage, fragment?: string) {
      if (page === destination.page && fragment === undefined) return;
      const next = { page, fragment: fragment ?? null };
      if (next.page === destination.page && next.fragment === destination.fragment) return;
      destination = next;
      for (const listener of listeners) listener();
    },
  };
}
