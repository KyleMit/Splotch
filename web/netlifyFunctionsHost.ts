import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite';
import { netlifyFunctionRoutes } from '../tools/lib/netlify-function-routes.mjs';

// Serves the /api Netlify Functions (netlify/functions/api-*.ts) on the Vite dev
// and preview servers' own origin, ahead of SvelteKit, the way Netlify routes a
// function's config.path ahead of the SvelteKit function in a deploy. That keeps
// `npm run dev`, the API smoke (which boots vite dev) and the Playwright suite
// (which boots vite preview) calling /api same-origin, with no Netlify CLI.
//
// One process hosts every function here, so the in-memory rate-limit buckets the
// endpoints share by key are shared across functions too. On Netlify each
// function is its own instance with its own buckets.

const FUNCTIONS_DIR = fileURLToPath(new URL('../netlify/functions', import.meta.url));
const RUNTIME_MODE_MODULE = fileURLToPath(
  new URL('./src/lib/server/runtimeMode.ts', import.meta.url)
);

type NetlifyFunction = (
  request: Request,
  context: { ip: string; waitUntil: (promise: Promise<unknown>) => void }
) => Promise<Response>;

type ModuleLoader = (file: string) => Promise<Record<string, unknown>>;

// Netlify matches a config.path with or without a trailing slash.
function routeOf(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

function toRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    // Readable.toWeb types its chunks as unknown; an IncomingMessage yields bytes.
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    // @ts-expect-error Node's fetch needs `duplex` for a streamed body; the DOM RequestInit has no such field.
    duplex: 'half',
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  // Set, not appended: Vite's own CORS middleware may already have written a
  // header the function answers for itself.
  for (const [name, value] of response.headers) res.setHeader(name, value);
  if (!response.body) {
    res.end();
    return;
  }
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

function functionsMiddleware(load: ModuleLoader): Connect.NextHandleFunction {
  const routes = new Map(
    netlifyFunctionRoutes(FUNCTIONS_DIR).map(({ file, path }) => [path, file])
  );
  return (req, res, next) => {
    const file = routes.get(routeOf(new URL(req.url ?? '/', 'http://localhost').pathname));
    if (!file) {
      next();
      return;
    }
    void (async () => {
      const handler = (await load(file)).default as NetlifyFunction;
      const response = await handler(toRequest(req), {
        ip: req.socket.remoteAddress ?? '127.0.0.1',
        // Nothing to keep alive: this process outlives the request anyway.
        waitUntil: (promise) => void promise.catch(() => {}),
      });
      await writeResponse(res, response);
    })().catch(next);
  };
}

// Netlify hands a function the site's environment; locally that is web/.env
// under whatever the shell already set, the precedence SvelteKit's
// $env/dynamic/private gave the same file.
function loadDotEnv(mode: string, envDir: string): void {
  for (const [name, value] of Object.entries(loadEnv(mode, envDir, ''))) {
    process.env[name] ??= value;
  }
}

// vite preview serves a production build, which the Playwright suite exercises,
// so its functions run as a deploy runs them: runtimeMode's `dev` false, which a
// module runner reads only when NODE_ENV is production.
async function productionLoader(root: string): Promise<{
  load: ModuleLoader;
  close: () => Promise<void>;
}> {
  process.env.NODE_ENV = 'production';
  const server: ViteDevServer = await createServer({
    configFile: false,
    root,
    mode: 'production',
    logLevel: 'warn',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const { dev } = await server.ssrLoadModule(RUNTIME_MODE_MODULE);
  if (dev !== false) throw new Error('[netlify-functions] preview functions loaded in dev mode');
  return { load: (file) => server.ssrLoadModule(file), close: () => server.close() };
}

export function netlifyFunctionsHost(): Plugin {
  return {
    name: 'splotch:netlify-functions',
    configureServer(server) {
      loadDotEnv(server.config.mode, server.config.envDir || server.config.root);
      server.middlewares.use(functionsMiddleware((file) => server.ssrLoadModule(file)));
    },
    async configurePreviewServer(server) {
      loadDotEnv(server.config.mode, server.config.envDir || server.config.root);
      const loader = await productionLoader(server.config.root);
      server.httpServer.once('close', () => void loader.close());
      server.middlewares.use(functionsMiddleware(loader.load));
    },
  };
}
