import type { ReactNode } from 'react';

// React Strict DOM compiles lineClamp to a bare `line-clamp`, which browsers apply only to a
// -webkit-box, so the web build wraps the text in shipping's clamp box (HubList's .hub-subtitle).
export function LineClampBox({ lines, children }: { lines: number; children: ReactNode }) {
  return (
    <span
      data-line-clamp={lines}
      style={{
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: lines,
        overflow: 'hidden',
      }}
    >
      {children}
    </span>
  );
}
