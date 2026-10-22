// Serves the custom Netlify Functions (netlify/functions/) on plain Node, each at the paths its
// `config.path` claims, as Netlify routes them — no SvelteKit and no `vite dev`. The API smoke
// (tools/api-smoke/run-local-contract.mjs) runs on startNetlifyFunctionHost; the native admin
// check and the RN E2E export host compose the parts below into servers of their own.
//
// A config-free Vite server is the module loader and nothing else: the functions' TypeScript
// imports are extensionless, which Node's type stripping cannot resolve, and the admin check
// reads the function's own module state through the same graph. Mode and environment come from
// the caller: no dotenv file is read, and `mode` alone decides runtimeMode's `dev`.

import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import { netlifyFunctionRoutes } from './netlify-function-routes.mjs';
import { ROOT } from './proc.mjs';
import { readApiMode, apiSelectionPlugin } from './api-mode.mjs';

const FUNCTIONS_DIR = join(ROOT, 'netlify', 'functions');
// The function loader uses the server's TypeScript project rather than the app's platform graph.
const FUNCTIONS_TSCONFIG = join(ROOT, 'netlify', 'tsconfig.json');
const RUNTIME_MODE_MODULE = join(ROOT, 'netlify', 'server', 'runtimeMode.ts');
const LOOPBACK = '127.0.0.1';

// Netlify matches a config.path with or without a trailing slash.
function routeOf(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

// Vite fixes import.meta.env.DEV from NODE_ENV as the server is created, and fills an unset
// NODE_ENV in itself, so the mode holds only for the creation and the caller's value returns.
async function createModuleLoader(mode, apiMode) {
  const callerNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  try {
    return await createViteServer({
      configFile: false,
      envDir: false,
      root: ROOT,
      tsconfig: FUNCTIONS_TSCONFIG,
      mode,
      logLevel: 'warn',
      appType: 'custom',
      plugins: [apiSelectionPlugin(apiMode)],
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    });
  } finally {
    if (callerNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = callerNodeEnv;
  }
}

/**
 * Every function, loaded as `mode` runs it. `development` is what `vite dev` gave the function:
 * runtimeMode's `dev` true, so the in-memory stand-ins for Netlify Blobs are writable and the CSRF
 * guard is off. `production` is a deploy's view: no Blobs, guard on.
 */
export async function loadNetlifyFunctions(mode, apiMode = 'production') {
  const vite = await createModuleLoader(mode, apiMode);
  const background = new Set();
  try {
    const { dev } = await vite.ssrLoadModule(RUNTIME_MODE_MODULE);
    if (dev !== (mode === 'development')) {
      throw new Error(`The Netlify functions loaded with dev ${dev} for ${mode}`);
    }
    const handlers = new Map();
    for (const { file, path } of netlifyFunctionRoutes(FUNCTIONS_DIR)) {
      handlers.set(path, (await vite.ssrLoadModule(file)).default);
    }
    for (const file of readdirSync(FUNCTIONS_DIR).filter((name) =>
      name.endsWith('-background.ts')
    )) {
      const worker = await vite.ssrLoadModule(join(FUNCTIONS_DIR, file));
      if (worker.config?.background !== true)
        throw new Error(`${file} must declare background: true`);
      handlers.set(`/.netlify/functions/${file.slice(0, -3)}`, (request, context) => {
        const task = worker.default(request, context);
        background.add(task);
        void task
          .catch((error) => console.error('[background-function]', error))
          .finally(() => background.delete(task));
        return Promise.resolve(new Response(null, { status: 202 }));
      });
    }
    const decorateResponse =
      apiMode === 'test'
        ? (await vite.ssrLoadModule(join(ROOT, 'tools/lib/noindex-response.ts'))).noindexResponse
        : (response) => response;
    return {
      decorateResponse,
      functionFor: (pathname) => handlers.get(routeOf(pathname)) ?? null,
      // A module from the functions' own graph, so state it holds is the function's.
      serverModule: (file) => vite.ssrLoadModule(file),
      close: async () => {
        await Promise.allSettled(background);
        await vite.close();
      },
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function toRequest(req) {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? LOOPBACK}`), {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half',
  });
}

/** The Response `handler` gives `req`, invoked with the context Netlify passes a function. */
export function invokeFunction(handler, req) {
  return handler(toRequest(req), {
    ip: req.socket.remoteAddress ?? LOOPBACK,
    // Nothing to keep alive: the host outlives the request anyway.
    waitUntil: (promise) => void promise.catch(() => {}),
  });
}

export async function writeResponse(res, response) {
  res.statusCode = response.status;
  // Set, not appended: Vite's own CORS middleware may already have written a header the function
  // answers for itself.
  for (const [name, value] of response.headers) res.setHeader(name, value);
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}

function listen(server, port) {
  return new Promise((ready, refuse) => {
    server.once('error', refuse);
    server.listen(port, LOOPBACK, () => {
      server.off('error', refuse);
      ready();
    });
  });
}

/**
 * Every function on a node:http server at `origin`, with Netlify's 404 for any path none claims.
 * `env` lands on process.env before the functions load, where Netlify hands a function the site's
 * environment.
 */
export async function startNetlifyFunctionHost({ mode, port, env }) {
  Object.assign(process.env, env);
  const functions = await loadNetlifyFunctions(mode, readApiMode(env));
  const server = createServer((req, res) => {
    const handler = functions.functionFor(new URL(req.url ?? '/', `http://${LOOPBACK}`).pathname);
    if (!handler) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    invokeFunction(handler, req)
      .then((response) => writeResponse(res, functions.decorateResponse(response)))
      .catch((error) => {
        console.error('[netlify-function-host]', req.method, req.url, error);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
  });
  try {
    await listen(server, port);
  } catch (error) {
    await functions.close();
    throw error;
  }
  return {
    origin: `http://${LOOPBACK}:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((closed) => server.close(closed));
      await functions.close();
    },
  };
}
