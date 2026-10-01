import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import ErrorPage from './+error.svelte';

const page = vi.hoisted(() => ({
  status: 404,
  url: new URL('https://splotch.art/privacy/missing'),
  error: { message: 'Private diagnostic detail' },
}));
vi.mock('$app/state', () => ({ page }));

function assertNativePending(document: Window['document']) {
  expect(document.querySelector('[role="alert"] h1')?.textContent).toBe('Oops!');
  expect(document.querySelector('.error-restart')?.textContent).toBe('Start over');
}

export function describeErrorPage(native = false) {
  describe('SvelteKit error page', () => {
    it('renders missing pages as a standalone page with recovery links', () => {
      page.status = 404;
      const { body, head } = render(ErrorPage);
      const { document } = new Window();
      document.body.innerHTML = body;
      document.head.innerHTML = head;
      if (native) {
        assertNativePending(document);
        return;
      }
      expect(document.querySelector('h1')?.textContent).toBe('This page wandered off');
      expect(document.querySelector('.lede')?.textContent).toBe(
        'The link may be old. These are still here:'
      );
      expect(
        [...document.querySelectorAll('.not-found-links a')].map((link) => ({
          href: link.getAttribute('href'),
          text: link.textContent,
        }))
      ).toEqual([
        { href: '/', text: 'Start drawing' },
        { href: '/changelog', text: 'Changelog' },
        { href: '/privacy', text: 'Privacy' },
      ]);
      expect(document.querySelector('[role="alert"]')).toBeNull();
      expect(document.querySelector('[aria-current="page"]')).toBeNull();
      expect(document.title).toBe('Page not found · Splotch');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex'
      );
      expect(document.querySelector('meta[property="og:image"]')).toBeNull();
      expect(body).not.toContain(page.error.message);
    });

    it.each([400, 403, 500, 503])('keeps status %i on the crash recovery screen', (status) => {
      page.status = status;
      const { body, head } = render(ErrorPage);
      const { document } = new Window();
      document.body.innerHTML = body;
      document.head.innerHTML = head;
      expect(document.querySelector('[role="alert"] h1')?.textContent).toBe('Oops!');
      expect(document.querySelector('.error-restart')?.textContent).toBe('Start over');
      expect(document.querySelector('.not-found')).toBeNull();
      expect(document.title).toBe('Oops! · Splotch');
      expect(body).not.toContain(page.error.message);
    });
  });
}
