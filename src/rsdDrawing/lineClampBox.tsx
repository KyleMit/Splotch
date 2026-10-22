import type { ReactNode } from 'react';

// React Native clamps text through the enclosing Text's numberOfLines, which React Strict DOM's
// lineClamp style sets on that span, so the text needs no box of its own here.
export function LineClampBox({ children }: { lines: number; children: ReactNode }) {
  return children;
}
