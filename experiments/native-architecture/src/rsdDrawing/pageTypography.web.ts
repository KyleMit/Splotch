import { useLayoutEffect, type RefObject } from 'react';

const PAGE_MEASURE = '62ch';
// PageShell.svelte's .page leading and wrapping, which every block on the page inherits.
export const PAGE_LINE_HEIGHT = 1.62;
const PAGE_TEXT_WRAP = 'pretty';

// RSD's native styles cannot express ch or text-wrap; the browser applies them before paint.
export function usePageTypography(
  title: RefObject<HTMLHeadingElement | null>,
  lede: RefObject<HTMLParagraphElement | null>
) {
  useLayoutEffect(() => {
    title.current?.style.setProperty('text-wrap', 'balance');
    lede.current?.style.setProperty('max-width', PAGE_MEASURE);
  }, [title, lede]);
}

// The page root's inherited leading and wrapping, as a callback ref: the scroll view can mount a
// new root without remounting the sheet. Web only: React Native text inherits no unitless leading.
export function pageTextRef(page: HTMLElement | null) {
  page?.style.setProperty('line-height', String(PAGE_LINE_HEIGHT));
  page?.style.setProperty('text-wrap', PAGE_TEXT_WRAP);
}
