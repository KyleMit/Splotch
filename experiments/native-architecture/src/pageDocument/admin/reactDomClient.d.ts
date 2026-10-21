// The candidate ships React DOM without its type package; the admin entry (adminApp.tsx) hydrates
// with React DOM directly, so React Native Web never loads, and calls only this.
declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function hydrateRoot(container: Element, children: ReactNode): unknown;
}
