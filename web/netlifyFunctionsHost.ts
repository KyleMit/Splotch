import { loadEnv, type Connect, type Plugin } from 'vite';
import {
  functionFiles,
  invokeFunction,
  loadNetlifyFunctions,
  writeResponse,
  type NetlifyFunction,
} from '../tools/lib/netlify-function-host.mjs';

// Serves the /api Netlify Function (netlify/functions/api.ts) on the Vite dev
// and preview servers' own origin, ahead of SvelteKit, the way Netlify routes a
// function's config.path ahead of the SvelteKit function in a deploy. That keeps
// `npm run dev` and the Playwright suite (which boots vite preview) calling /api
// same-origin, with no Netlify CLI. The request adapter and the preview's
// production module graph are the plain Node host's
// (tools/lib/netlify-function-host.mjs), which the API smoke runs on its own.

type FunctionLookup = (pathname: string) => NetlifyFunction | Promise<NetlifyFunction> | null;

function functionsMiddleware(functionFor: FunctionLookup): Connect.NextHandleFunction {
  return (req, res, next) => {
    const handler = functionFor(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!handler) {
      next();
      return;
    }
    void (async () => {
      await writeResponse(res, await invokeFunction(await handler, req));
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

export function netlifyFunctionsHost(): Plugin {
  return {
    name: 'splotch:netlify-functions',
    configureServer(server) {
      loadDotEnv(server.config.mode, server.config.envDir || server.config.root);
      const fileFor = functionFiles();
      server.middlewares.use(
        functionsMiddleware((pathname) => {
          const file = fileFor(pathname);
          // Loaded through the dev server's own graph, so an edit to the function is live.
          return file
            ? server.ssrLoadModule(file).then((module) => module.default as NetlifyFunction)
            : null;
        })
      );
    },
    // vite preview serves a production build, which the Playwright suite
    // exercises, so its functions run as a deploy runs them.
    async configurePreviewServer(server) {
      loadDotEnv(server.config.mode, server.config.envDir || server.config.root);
      const functions = await loadNetlifyFunctions('production');
      server.httpServer.once('close', () => void functions.close());
      server.middlewares.use(functionsMiddleware(functions.functionFor));
    },
  };
}
