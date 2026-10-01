// @vitest-environment node
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import NativeNotFoundPage from './NativeNotFoundPage.svelte';

it('keeps the existing recovery available while native loads its friendly page', () => {
  const { document } = new Window();
  const { body } = render(NativeNotFoundPage);
  document.body.innerHTML = body;
  expect(document.querySelector('[role="alert"] h1')?.textContent).toBe('Oops!');
  expect(document.querySelector('.error-restart')?.textContent).toBe('Start over');
});
