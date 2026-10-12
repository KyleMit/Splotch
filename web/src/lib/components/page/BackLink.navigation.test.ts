import { flushSync, mount, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { AfterNavigate } from '@sveltejs/kit';

const navigation = vi.hoisted(() => ({
  afterNavigate: vi.fn<(callback: (navigation: AfterNavigate) => void) => void>(),
}));
vi.mock('$app/navigation', () => navigation);

import BackLink from './BackLink.svelte';

let mounted: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  sessionStorage.clear();
  navigation.afterNavigate.mockClear();
});

it('renders the cold arrival label when the previous route has no URL', () => {
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(BackLink, { target });
  flushSync();
  const callback = navigation.afterNavigate.mock.calls[0][0];
  // The native static fallback supplies this payload despite Kit typing the URL as non-null.
  expect(() =>
    Reflect.apply(callback, undefined, [
      {
        from: { url: null, params: {}, route: { id: null } },
        to: { url: new URL('https://splotch.art/privacy'), params: {}, route: { id: '/privacy' } },
        type: 'enter',
        willUnload: false,
        complete: Promise.resolve(),
        delta: undefined,
      },
    ])
  ).not.toThrow();
  flushSync();
  expect(target.querySelector('a')?.textContent?.trim()).toBe('Start drawing');
});
