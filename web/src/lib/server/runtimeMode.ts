// Whether this server is running under Vite's dev pipeline: `vite dev`, Vitest,
// and the dev-mode function host in web/netlifyFunctionsHost.ts. It gates the
// writable in-memory stand-ins for Netlify Blobs. Vite's builds replace the
// expression with false, and a function Netlify bundles itself has no
// import.meta.env at all, so every deployed bundle reads false. It replaces
// SvelteKit's $app/environment `dev`, which a plain Netlify Function cannot resolve.
export const dev: boolean = import.meta.env?.DEV === true;
