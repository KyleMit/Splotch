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
  let current: AppLocation = 'drawing';
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(page: AppPage) {
      if (page === current) return;
      current = page;
      for (const listener of listeners) listener();
    },
  };
}
