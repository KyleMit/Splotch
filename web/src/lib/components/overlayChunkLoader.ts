// The one static reference to the boot-hidden overlay chunk's dynamic import,
// reached only through a dynamic import of its own. SvelteKit inlines into the
// prerendered <head> the stylesheet of every chunk a route node imports
// dynamically at depth one when the server bundle imports the same chunk
// (`find_deps` in @sveltejs/kit's Vite plugin groups dynamic-import CSS by
// depth; `build_server` inlines the groups the SSR manifest also lists), which
// put every dialog's CSS on the first-paint document. One more dynamic hop
// puts the overlay chunk at depth two, so its stylesheet loads with the chunk
// at idle instead: Vite's preload helper links it before the import resolves.
// web/tests/startup-bundle.spec.ts guards the prerendered head.
export const loadOverlayChunk = () => import('./overlayChunk');
