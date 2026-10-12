import type { createPageParentCenter as createNativePageParentCenter } from './pageParentCenter.svelte';

// A static import of the native factory reaches modal code even when its caller's
// CAPACITOR branch is erased. The web entry keeps the root error graph independent.
export function createPageParentCenter(): ReturnType<typeof createNativePageParentCenter> {
  throw new Error('Native PageShell controller is unavailable in the web build');
}
