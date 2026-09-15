// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRawSnippet, type Component } from 'svelte';
import { parse } from 'svelte/compiler';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { DEFERRED_ICON_NAMES } from '$lib/components/deferredIcons';
import { deferredIconMarkup } from '$lib/components/iconRegistry.svelte';
import { SECTIONS } from '$lib/components/settings/sections';
import { aiGenerationState } from '$lib/state/aiGeneration.svelte';
import { aiProgressState } from '$lib/state/aiProgress.svelte';
import { appearanceState } from '$lib/state/appearance.svelte';
import { canvasState } from '$lib/state/canvas.svelte';
import { coloringBookState } from '$lib/state/coloringBook.svelte';
import { coloringPacksState } from '$lib/state/coloringPacks.svelte';
import { colorsState } from '$lib/state/colors.svelte';
import { freeGenerationsState } from '$lib/state/freeGenerations.svelte';
import { fullscreenState } from '$lib/state/fullscreen.svelte';
import { installState } from '$lib/state/install.svelte';
import { layoutState } from '$lib/state/layout.svelte';
import { networkState } from '$lib/state/network.svelte';
import { parentalGateState } from '$lib/state/parentalGate.svelte';
import { sectionsSeenState } from '$lib/state/sectionsSeen.svelte';
import { sessionCountersState } from '$lib/state/sessionCounters.svelte';
import { setSound, settingsState } from '$lib/state/settings.svelte';
import { strokeWidthState } from '$lib/state/strokeWidth.svelte';
import { toolState } from '$lib/state/tool.svelte';
import {
  aiPromptModal,
  coloringBookModal,
  colorPickerModal,
  settingsModal,
  uiState,
} from '$lib/state/ui.svelte';

// Module-level state is one object per server instance, shared by every request
// it answers. The prerendered routes never run on the server after the build,
// but the routes below render per request, so a write during their render would
// leak one visitor's state into the next visitor's page. Nothing does that today;
// this is what notices the change that does.
//
// This file runs under vitest.webSsr.config.ts, which compiles
// `__IS_CAPACITOR__` as false the way the Netlify SSR bundle does, so web-only
// render branches are the ones rendered. `browser` is mocked false for the same
// reason: under Vitest it is a compile-time `true` even in a node-environment
// file (docs/audit-deferred/decisions/ssr-guard-idioms.md), which would run
// every listener store's client-only install() against a missing `window`.
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

// Reads every enumerable getter the way a component would, skipping mutators.
// Nested objects recurse; a Blob is kept by identity, which is what
// "unchanged" means for it.
function readGetters(value: unknown, depth = 0): unknown {
  if (typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => readGetters(item, depth + 1));
  if (value instanceof Blob) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const read = (value as Record<string, unknown>)[key];
    if (typeof read !== 'function') out[key] = readGetters(read, depth + 1);
  }
  return out;
}

// One observer per module-level instance, keyed by the name it is declared
// under, reading it through the instance's own read API. Getters cover most of
// them; an instance whose state is reachable only through query methods is read
// through those, since its getters alone would snapshot as nothing. The drift
// guard below holds this table to every instance declared in lib/.
const OBSERVERS: Record<string, () => unknown> = {
  persistedStateStatus: () => readGetters(persistedStateStatus),
  aiGenerationState: () => readGetters(aiGenerationState),
  aiProgressState: () => readGetters(aiProgressState),
  appearanceState: () => appearanceState.resolvedTheme(),
  canvasState: () => readGetters(canvasState),
  coloringBookState: () => readGetters(coloringBookState),
  coloringPacksState: () => readGetters(coloringPacksState),
  colorsState: () => readGetters(colorsState),
  freeGenerationsState: () => readGetters(freeGenerationsState),
  fullscreenState: () => readGetters(fullscreenState),
  installState: () => [readGetters(installState), installState.installPromptStage()],
  layoutState: () => readGetters(layoutState),
  networkState: () => readGetters(networkState),
  parentalGateState: () => readGetters(parentalGateState),
  sectionsSeenState: () =>
    SECTIONS.map(({ id }) => [
      sectionsSeenState.isSectionUnseen(id),
      sectionsSeenState.hasSectionActivity(id),
    ]),
  sessionCountersState: () => [
    sessionCountersState.sessionCount('settingsActivity'),
    sessionCountersState.sessionCount('installReprompt'),
  ],
  settingsState: () => readGetters(settingsState),
  strokeWidthState: () => [readGetters(strokeWidthState), strokeWidthState.activeStrokeSize()],
  toolState: () => readGetters(toolState),
  uiState: () => readGetters(uiState),
  colorPickerModal: () => readGetters(colorPickerModal),
  coloringBookModal: () => readGetters(coloringBookModal),
  settingsModal: () => readGetters(settingsModal),
  aiPromptModal: () => readGetters(aiPromptModal),
  deferredIcons: () => DEFERRED_ICON_NAMES.map(deferredIconMarkup),
};

function snapshotAll(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(OBSERVERS).map(([name, read]) => [name, read()]));
}

const emptyChildren = createRawSnippet(() => ({ render: () => '<main></main>' }));

// Each loader imports its page and hands back a render of it, so the imports'
// own module-load work lands before the snapshot and only the render lands after
// it. The component and its props are checked against each other here rather
// than cast apart.
function pageRender<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props
): () => string {
  return () => render(component, { props }).body;
}

// Every page that renders per request on the web, with the props its load would
// hand it; the drift guard at the bottom holds the list to the route tree.
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
  '/design': async () => {
    const { load } = await import('./design/+page');
    return pageRender((await import('./design/+page.svelte')).default, {
      data: await load(),
      params: {},
    });
  },
  'the error page': async () => pageRender((await import('./+error.svelte')).default, {}),
  'the root layout': async () =>
    pageRender((await import('./+layout.svelte')).default, { children: emptyChildren }),
};

describe('per-request routes leave module-level state untouched', () => {
  it('reads real values from every observer, so an empty comparison cannot pass', () => {
    const snapshot = snapshotAll();
    for (const [name, value] of Object.entries(snapshot)) {
      expect(JSON.stringify(value) ?? '', name).not.toMatch(/^(\{\}|\[\]|)$/);
    }
  });

  it('reports a write, so a changed snapshot is what a leak looks like', () => {
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

const routesDir = dirname(fileURLToPath(import.meta.url));
const libDir = join(routesDir, '..', 'lib');

function filesUnder(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path, accept);
    return accept(path) ? [path] : [];
  });
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// A module-level instance is a top-level binding initialised by a createX()
// factory or a rune. Test files are not shipped and are skipped.
// The initializer may sit on the line after `=` once a formatter wraps it.
const MODULE_INSTANCE =
  /^(?:export )?(?:const|let) (\w+)(?:\s*:[^=\n]+)? =\s*(?:create[A-Z]\w*\s*[<(]|\$state)/gm;

describe('the state observer table', () => {
  it('observes every module-level instance declared under lib/', () => {
    const declared = filesUnder(
      libDir,
      (path) => path.endsWith('.svelte.ts') && !path.endsWith('.test.ts')
    ).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(MODULE_INSTANCE)].map((match) => match[1])
    );

    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => !(name in OBSERVERS))).toEqual([]);
  });

  // A component's `<script module>` runs once per server instance too, so a rune
  // there is shared across requests exactly like a lib/state module — but it has
  // no read API to observe. Shared state belongs in lib/state, where the table
  // above can see it; a module script holds constants and helpers only.
  it('finds no rune state in any component module script', () => {
    const svelteFiles = filesUnder(join(routesDir, '..'), (path) => path.endsWith('.svelte'));
    const moduleScripts = svelteFiles.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const module = parse(source, { modern: true }).module;
      return module ? [{ path, body: source.slice(module.start, module.end) }] : [];
    });

    expect(moduleScripts.length).toBeGreaterThan(0);
    expect(
      moduleScripts
        .filter(({ body }) => /\$state\b|\$derived\b/.test(body))
        .map(({ path }) => relative(join(routesDir, '..'), path))
    ).toEqual([]);
  });
});

// Which value a `prerender` export takes in the web build. A route file can use
// any expression, so only the forms in use here are understood; anything else
// fails rather than being guessed at.
function webPrerender(source: string, path: string): boolean | undefined {
  const match = /^export const prerender = (.+);$/m.exec(source);
  if (!match) return undefined;
  switch (match[1].trim()) {
    case 'true':
    case '!__IS_CAPACITOR__':
      return true;
    case 'false':
    case '__IS_CAPACITOR__':
      return false;
    default:
      throw new Error(`Unrecognised prerender value in ${path}: ${match[1]} — teach webPrerender`);
  }
}

// SvelteKit takes a page's own `prerender` first and otherwise inherits the
// nearest layout's, walking up to the routes root.
function effectivePrerender(pageDir: string): boolean {
  const candidates = (dir: string, kind: 'page' | 'layout') =>
    [`+${kind}.ts`, `+${kind}.server.ts`].map((file) => join(dir, file));
  let files = candidates(pageDir, 'page');
  for (let dir = pageDir; ; dir = dirname(dir)) {
    files = [...files, ...candidates(dir, 'layout')];
    if (dir === routesDir) break;
  }
  for (const file of files) {
    const source = readIfPresent(file);
    const value = source === null ? undefined : webPrerender(source, file);
    if (value !== undefined) return value;
  }
  return false;
}

describe('the per-request route table', () => {
  // Every page under routes/dev answers 404 on splotch.art unless the dev
  // harness flag is set (lib/server/devHarness.ts), so none of them serves a
  // visitor there.
  const DEV_ROUTES = join(routesDir, 'dev');

  it('covers every page the web build renders per request', () => {
    const pages = filesUnder(routesDir, (path) => path.endsWith('+page.svelte'))
      .map((path) => dirname(path))
      .filter((dir) => dir !== DEV_ROUTES && !dir.startsWith(`${DEV_ROUTES}/`));
    const perRequest = pages
      .filter((dir) => !effectivePrerender(dir))
      .map((dir) => `/${relative(routesDir, dir)}`);

    const covered = new Set(Object.keys(PER_REQUEST_ROUTES).map((route) => route.split(' ')[0]));
    expect(pages.length).toBeGreaterThan(0);
    expect(perRequest.filter((route) => !covered.has(route))).toEqual([]);
  });
});
