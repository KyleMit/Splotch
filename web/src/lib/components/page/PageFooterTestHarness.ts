import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import releases from '$lib/releases.json';
import PageFooter from './PageFooter.svelte';

const page = vi.hoisted(() => ({ url: { pathname: '/privacy' }, status: 200 }));
vi.mock('$app/state', () => ({ page }));

function renderedFooter(pathname: string, status = 200) {
  page.url.pathname = pathname;
  page.status = status;
  const { document } = new Window();
  document.body.innerHTML = render(PageFooter).body;
  return document;
}

export function describePageFooter(native: boolean) {
  describe('standalone page footer', () => {
    it('renders three sibling sections and a decorative home mark', () => {
      const document = renderedFooter('/beta');
      expect(document.querySelectorAll('nav[aria-label="Splotch pages"] li')).toHaveLength(3);
      expect(document.querySelector('.footer-brand')?.getAttribute('href')).toBe('/');
      expect(
        document.querySelector('.footer-brand [data-icon="splotchy"]')?.getAttribute('aria-hidden')
      ).toBe('true');
    });

    it.each(['/privacy', '/privacy/details'])(
      'marks the privacy section without a self-link at %s',
      (pathname) => {
        const document = renderedFooter(pathname);
        expect(document.querySelector('span[aria-current="page"]')?.textContent?.trim()).toBe(
          'Privacy'
        );
        expect(document.querySelector('nav a[href="/privacy"]')).toBeNull();
        expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
      }
    );

    it('uses the public release and its source date rather than the build version', () => {
      const document = renderedFooter('/privacy');
      const latest = releases[0];
      expect(document.querySelector('.version')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `Splotch ${latest.version} · released ${latest.dateLabel} · What's new`
      );
      expect(document.querySelector('time')?.getAttribute('datetime')).toBe(latest.datetime);
      expect(document.querySelector('.version a')?.getAttribute('href')).toBe(
        `/changelog#${latest.id}`
      );
    });

    it('links directly to the newest release within the changelog', () => {
      expect(renderedFooter('/changelog').querySelector('.version a')?.getAttribute('href')).toBe(
        `#${releases[0].id}`
      );
    });

    it.each(['/privacy/missing', '/changelog/missing', '/feedback/missing'])(
      'keeps sibling links available on a missing page at %s',
      (pathname) => {
        const document = renderedFooter(pathname, 404);
        expect(document.querySelectorAll('nav [aria-current]')).toHaveLength(0);
        expect(document.querySelector('nav a[href="/privacy"]')).not.toBeNull();
        expect(document.querySelector('nav a[href="/changelog"]')).not.toBeNull();
        expect(document.querySelector('.version a')?.getAttribute('href')).toBe(
          `/changelog#${releases[0].id}`
        );
      }
    );

    it('keeps native feedback external and marks feedback current only on web', () => {
      const document = renderedFooter('/feedback');
      expect(document.querySelector('nav [aria-current]')?.textContent?.trim()).toBe(
        native ? undefined : 'Send feedback'
      );
      expect(
        document.querySelector('nav a[href="https://splotch.art/feedback"]')?.getAttribute('target')
      ).toBe(native ? '_blank' : undefined);
      expect(document.querySelector('nav [data-external-mark]') !== null).toBe(native);
    });
  });
}
