export const INFORMATION_TOP_ID = 'top';
export const APP_PAGE_PATHS = {
  drawing: '/',
  privacy: '/privacy',
  changelog: '/changelog',
  feedback: '/feedback',
} as const;
export type AppPage = keyof typeof APP_PAGE_PATHS;
export type AppLocation = AppPage | 'notFound';

export function appPageAt(path: string): AppLocation {
  if (path === '/index.html') return 'drawing';
  for (const page of ['drawing', 'privacy', 'changelog', 'feedback'] as const) {
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
