// The server's secrets and settings. Netlify hands every function, SvelteKit's
// included, the site's environment as process.env; the local Vite hosts load
// web/.env into it first (web/netlifyFunctionsHost.ts). Read through here rather
// than SvelteKit's $env/dynamic/private, which a plain Netlify Function cannot
// resolve.
export const env: Record<string, string | undefined> = process.env;
