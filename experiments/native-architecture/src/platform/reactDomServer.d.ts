// The candidate ships React DOM without its type package; the first-frame prerender
// (prerenderFirstFrame.tsx) calls only this.
declare module 'react-dom/server' {
  import type { ReactNode } from 'react';
  export function renderToString(node: ReactNode): string;
}
