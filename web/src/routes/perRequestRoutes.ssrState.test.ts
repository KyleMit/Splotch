// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRawSnippet, type Component } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

// Module-level state in lib/state is one object per server instance, shared by
// every request it answers. The prerendered routes never run on the server after
// the build, but the routes below render per request, so a write during their
// render would leak one visitor's state into the next visitor's page. Nothing
// does that today; this is what notices the change that does.
//
// `browser` is mocked false because that is what the server bundle sees: under
// Vitest it is a compile-time `true` even in a node-environment file
// (docs/audit-deferred/decisions/ssr-guard-idioms.md), which would run the
// client-only install() of every listener store against a missing `window` and
// fail for a reason that never happens in production.
vi.mock('$app/environment', () => ({
  browser: false,
  dev: false,
  building: false,
  version: 'test',
}));
vi.mock('$app/forms', () => ({
  applyAction: vi.fn(),
  deserialize: vi.fn(),
  enhance: () => ({ destroy() {} }),
}));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));

const stateModules = import.meta.glob<Record<string, unknown>>(
  ['$lib/state/*.svelte.ts', '$lib/boot/persistedStateStatus.svelte.ts'],
  { eager: true }
);

// The exported singletons the naming rule defines (`<basename>State`, a modal
// controller ending in `Modal`), which is every shared state object a route can
// reach. Anything else a state module exports is a function or a constant.
function exportedSingletons(): Map<string, object> {
  const singletons = new Map<string, object>();
  for (const [path, module] of Object.entries(stateModules)) {
    for (const [name, value] of Object.entries(module)) {
      if (!/(State|Modal|Status)$/.test(name)) continue;
      if (typeof value !== 'object' || value === null) continue;
      singletons.set(`${path.split('/').pop()}#${name}`, value);
    }
  }
  return singletons;
}

// Reads every enumerable getter the way a component would and keeps the
// values, skipping mutators. Nested objects recurse; a Blob or other opaque
// value is kept by identity, which is what "unchanged" means for it.
function snapshot(value: unknown, depth = 0): unknown {
  if (typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => snapshot(item, depth + 1));
  if (value instanceof Blob) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const read = (value as Record<string, unknown>)[key];
    if (typeof read !== 'function') out[key] = snapshot(read, depth + 1);
  }
  return out;
}

function snapshotAll(): Record<string, unknown> {
  return Object.fromEntries(
    [...exportedSingletons()].map(([name, singleton]) => [name, snapshot(singleton)])
  );
}

const emptyChildren = createRawSnippet(() => ({ render: () => '<main></main>' }));

async function designData() {
  const { load } = await import('./design/+page');
  return load();
}

// Every route that renders per request, with the props its load would hand it.
// Each loader imports its page and hands back a render of it, so the imports'
// own module-load work lands before the snapshot and only the render lands
// after it. The component and its props are checked against each other here
// rather than cast apart. The drift guard at the bottom holds the list to the
// source.
function pageRender<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props
): () => string {
  return () => render(component, { props }).body;
}

const PER_REQUEST_ROUTES: Record<string, () => Promise<() => string>> = {
  '/admin (signed out)': async () =>
    pageRender((await import('./admin/+page.svelte')).default, {
      data: {
        authed: false,
        persistent: true,
        invites: [],
        usageAvailable: true,
        freeGrantStats: null,
      },
      form: null,
    }),
  '/admin (signed in)': async () =>
    pageRender((await import('./admin/+page.svelte')).default, {
      data: {
        authed: true,
        persistent: true,
        invites: [
          {
            token: 'managed-code',
            url: 'https://splotch.art/?code=managed-code',
            usage: null,
          },
        ],
        usageAvailable: true,
        freeGrantStats: {
          persistent: true,
          dailyProviderStarts: 0,
          dailyProviderStartLimit: 100,
          sampledGrantCount: 0,
          grantSampleLimit: 100,
          grantSamplePartial: false,
          sampledSuccessful: 0,
          sampledAttempts: 0,
          sampledFailures: 0,
          sampledActiveGrants: 0,
          sampledExhaustedGrants: 0,
          sampledActiveReservations: 0,
          recent: [],
        },
      },
      form: null,
    }),
  '/feedback': async () =>
    pageRender((await import('./feedback/+page.svelte')).default, {
      data: { sent: false },
      form: null,
      params: {},
    }),
  '/feedback (sent)': async () =>
    pageRender((await import('./feedback/+page.svelte')).default, {
      data: { sent: true },
      form: null,
      params: {},
    }),
  '/design': async () =>
    pageRender((await import('./design/+page.svelte')).default, {
      data: await designData(),
      params: {},
    }),
  'the error page': async () => pageRender((await import('./+error.svelte')).default, {}),
  'the root layout': async () =>
    pageRender((await import('./+layout.svelte')).default, { children: emptyChildren }),
};

describe('per-request routes leave module-level state untouched', () => {
  it('sees the shared state it guards, so an empty comparison cannot pass', () => {
    const names = [...exportedSingletons().keys()];
    expect(names).toContain('settings.svelte.ts#settingsState');
    expect(names).toContain('ui.svelte.ts#settingsModal');
    expect(names).toContain('persistedStateStatus.svelte.ts#persistedStateStatus');
  });

  it('reports a write, so a changed snapshot is what a leak looks like', async () => {
    const { settingsState, setSound } = await import('$lib/state/settings.svelte');
    const before = snapshotAll();
    const original = settingsState.soundEnabled;
    setSound(!original);
    try {
      expect(snapshotAll()).not.toEqual(before);
    } finally {
      setSound(original);
    }
    expect(snapshotAll()).toEqual(before);
  });

  it.each(Object.keys(PER_REQUEST_ROUTES))(
    'renders %s without writing shared state',
    async (route) => {
      const renderRoute = await PER_REQUEST_ROUTES[route]();
      const before = snapshotAll();

      const body = renderRoute();

      expect(body.length).toBeGreaterThan(0);
      expect(snapshotAll()).toEqual(before);
    }
  );
});

// A route opts out of the prerender in its +page.ts or +page.server.ts. Each one
// that renders a page (the deprecated beta redirects render nothing) must be in
// the table above, so a new per-request route cannot join without the guard.
describe('the per-request route table', () => {
  const routesDir = dirname(fileURLToPath(import.meta.url));
  const routeModules = import.meta.glob<string>(['./**/+page.ts', './**/+page.server.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('covers every route that opts out of the prerender and renders a page', () => {
    const optedOut = Object.entries(routeModules)
      .filter(([path]) => !path.startsWith('./dev/'))
      .filter(([, source]) => /export const prerender = false;/.test(source))
      .map(([path]) => dirname(path))
      .filter((dir) => {
        try {
          readFileSync(`${routesDir}/${dir}/+page.svelte`);
          return true;
        } catch {
          return false;
        }
      })
      .map((dir) => `/${relative('.', dir)}`);

    const covered = new Set(Object.keys(PER_REQUEST_ROUTES).map((route) => route.split(' ')[0]));
    expect(optedOut.length).toBeGreaterThan(0);
    expect(optedOut.filter((route) => !covered.has(route))).toEqual([]);
  });
});
