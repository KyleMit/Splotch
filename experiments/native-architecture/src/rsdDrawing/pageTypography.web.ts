import { useLayoutEffect, type RefObject } from 'react';

const PAGE_MEASURE = '62ch';

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
