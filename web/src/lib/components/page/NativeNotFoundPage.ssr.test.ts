// @vitest-environment node
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import NativeNotFoundPage from './NativeNotFoundPage.svelte';

it('keeps quiet drawing recovery available while native loads its friendly page', () => {
  const { document } = new Window();
  const { body, head } = render(NativeNotFoundPage);
  document.body.innerHTML = body;
  document.head.innerHTML = head;
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('.error-screen')).toBeNull();
  expect(document.querySelector('h1')?.textContent).toBe('Page not found');
  expect(document.querySelector('a')?.getAttribute('href')).toBe('/');
  expect(document.querySelector('a')?.textContent).toBe('Start drawing');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  const friendlySource = readFileSync(new URL('./NotFoundPage.svelte', import.meta.url), 'utf8');
  expect(document.title).toBe(friendlySource.match(/<title>([^<]+)<\/title>/)?.[1]);
});
