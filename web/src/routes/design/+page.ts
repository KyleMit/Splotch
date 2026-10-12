// The public living styleguide (ADR-0096): the design system rendered from its
// real sources. prerender = false keeps the page out of the native static
// export (strict: false emits nothing for a route that opts out) and serves it
// via SSR on the web; nothing in the kid-facing apps links here.
export const prerender = false;

// Keep the specimen code in its own chunk without dropping it from SSR or
// delaying its layout until hydration; the route awaits the universal load.
export async function load() {
  const { default: PrimitiveSections } =
    await import('$lib/components/styleguide/PrimitiveSections.svelte');
  return { PrimitiveSections };
}
