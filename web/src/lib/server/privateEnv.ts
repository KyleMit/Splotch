// The server's secrets and settings. Netlify hands every function, SvelteKit's
// included, the site's environment as process.env. Locally, the Vite servers'
// function plugin (web/netlifyFunctionsHost.ts) loads web/.env into it first;
// the plain Node host (tools/lib/netlify-function-host.mjs) reads no dotenv and
// takes the env its caller passes. Read through here rather
// than SvelteKit's $env/dynamic/private, which a plain Netlify Function cannot
// resolve.
export const env: Record<string, string | undefined> = process.env;
