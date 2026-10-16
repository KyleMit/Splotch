import type { RefObject } from 'react';

// The browser's character measure and balanced wrapping have no native text-style equivalent.
export function usePageTypography(
  _title: RefObject<HTMLHeadingElement | null>,
  _lede: RefObject<HTMLParagraphElement | null>
) {}
