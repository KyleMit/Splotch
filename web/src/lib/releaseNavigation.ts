import { tick } from 'svelte';

const ARRIVAL_DURATION_MS = 2400;

export function createReleaseNavigation(host: HTMLElement) {
  host.style.setProperty('--release-arrival-duration', `${ARRIVAL_DURATION_MS}ms`);
  let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
  let navigationSequence = 0;
  let disposed = false;

  function target(href: string) {
    if (!href.startsWith('#release-')) return null;
    return (
      [...host.querySelectorAll<HTMLElement>('.release')].find(
        (article) => `#${article.id}` === href
      ) ?? null
    );
  }

  async function reveal(href: string) {
    const article = target(href);
    const fold = article?.closest('details');
    if (fold instanceof HTMLDetailsElement) fold.open = true;
    await tick();
  }

  function arrive(href: string) {
    clearTimeout(arrivalTimer);
    const previous = host.querySelector('[data-arrived]');
    previous?.removeAttribute('data-arrived');
    const article = target(href);
    if (!article || disposed) return;
    // A style flush restarts the fade when its active article is picked again.
    if (previous === article) article.getBoundingClientRect();
    article.setAttribute('data-arrived', '');
    arrivalTimer = setTimeout(() => article.removeAttribute('data-arrived'), ARRIVAL_DURATION_MS);
  }

  async function navigate() {
    const sequence = ++navigationSequence;
    const href = window.location.hash;
    if (!target(href)) return;
    await reveal(href);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (disposed || sequence !== navigationSequence || window.location.hash !== href) return;
    target(href)?.scrollIntoView();
    arrive(href);
  }

  function onClick(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (!(event.target instanceof Element)) return;
    const href = event.target.closest('a[href^="#release-"]')?.getAttribute('href');
    if (!href) return;
    if (window.location.hash === href && event.target.closest('.contents-rail')) {
      event.preventDefault();
      void navigate();
    } else void reveal(href);
  }

  function onToggle(event: Event) {
    const fold = event.target;
    if (!(fold instanceof HTMLDetailsElement) || !fold.open) return;
    const summary = fold.querySelector('summary');
    if (document.activeElement !== summary) return;
    const heading = fold.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  host.addEventListener('toggle', onToggle, true);
  const page = host.closest<HTMLElement>('.changelog');
  page?.addEventListener('click', onClick, true);
  window.addEventListener('hashchange', navigate);
  window.addEventListener('popstate', navigate);
  void navigate();

  return {
    reveal,
    arrive,
    dispose() {
      disposed = true;
      host.style.removeProperty('--release-arrival-duration');
      host.removeEventListener('toggle', onToggle, true);
      clearTimeout(arrivalTimer);
      page?.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('popstate', navigate);
      host.querySelector('[data-arrived]')?.removeAttribute('data-arrived');
    },
  };
}
