// A local host that answers as the Netlify deploy does: the directory netlify.toml publishes, by
// file and by pretty URL, its [[redirects]] and [[headers]] rules, its 404.html with status 404,
// and every /api path from the site's own functions (netlify/functions/), composed from the parts
// tools/lib/netlify-function-host.mjs exports so static files and the API share one origin.
//
// Precedence is Netlify's: a function whose config.path claims the path runs first (it does not
// set preferStatic); then a published file; then a redirect, which a file at its path shadows
// unless it is forced; then 404.html. Netlify applies [[headers]] to everything but a function's
// answer, which sets its own.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import {
  invokeFunction,
  loadNetlifyFunctions,
  writeResponse,
} from '../../tools/lib/netlify-function-host.mjs';
import { headersFor, readNetlifyConfig, redirectFor } from './netlifyConfig.ts';
import { readApiMode } from '../../tools/lib/api-mode.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const NETLIFY_TOML = join(REPO_ROOT, 'netlify.toml');
// Netlify's own convention for a site's not-found page, not a name the app chooses.
const NOT_FOUND_DOCUMENT = '404.html';
const LOOPBACK = '127.0.0.1';
const REWRITE_STATUSES = new Set([200, 404]);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=UTF-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

function fileFinder(root: string) {
  const fileAt = (path: string) => {
    const candidate = resolve(root, `.${path}`);
    if (candidate !== root && !candidate.startsWith(root + sep)) return null;
    return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  };
  // A pretty URL: /privacy serves privacy.html, and a directory serves its index.html.
  return (pathname: string) => {
    const path = decodeURIComponent(pathname);
    return (
      fileAt(path) ??
      (path.endsWith('/') ? null : fileAt(`${path}.html`)) ??
      fileAt(`${path.replace(/\/$/, '')}/index.html`)
    );
  };
}

function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: string,
  status: number,
  headers: Record<string, string>
) {
  response.statusCode = status;
  response.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(request.method === 'HEAD' ? undefined : readFileSync(file));
}

function redirectTarget(target: string, search: string): string {
  return target.includes('?') || search === '' ? target : `${target}${search}`;
}

export type NetlifySite = { origin: string; close: () => Promise<void> };

/**
 * The published directory and every function on one origin. `env` lands on process.env before the
 * functions load, where Netlify hands a function the site's environment. The caller supplies any
 * local Blobs context; the CSRF guard stays on.
 */
export async function startNetlifySite({
  port,
  env,
}: {
  port: number;
  env: Record<string, string>;
}): Promise<NetlifySite> {
  const config = readNetlifyConfig(readFileSync(NETLIFY_TOML, 'utf8'));
  const root = resolve(REPO_ROOT, config.publish);
  if (!existsSync(join(root, NOT_FOUND_DOCUMENT)))
    throw new Error(`Nothing is published at ${root}: build it with npm run build:site`);
  Object.assign(process.env, env);
  const functions = await loadNetlifyFunctions('production', readApiMode(env));
  const findFile = fileFinder(root);
  const notFound = join(root, NOT_FOUND_DOCUMENT);

  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    const { pathname, search } = new URL(request.url ?? '/', `http://${LOOPBACK}`);
    const handler = functions.functionFor(pathname);
    if (handler)
      return writeResponse(
        response,
        functions.decorateResponse(await invokeFunction(handler, request))
      );
    const headers = headersFor(config.headers, pathname);
    const file = findFile(pathname);
    const redirect = redirectFor(config.redirects, pathname);
    if (file && !redirect?.force) return sendFile(request, response, file, 200, headers);
    if (redirect && REWRITE_STATUSES.has(redirect.status)) {
      const rewritten =
        findFile(new URL(redirect.target, `http://${LOOPBACK}`).pathname) ?? notFound;
      return sendFile(request, response, rewritten, redirect.status, headers);
    }
    if (redirect) {
      response.statusCode = redirect.status;
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      response.setHeader('Location', redirectTarget(redirect.target, search));
      return response.end();
    }
    return sendFile(request, response, notFound, 404, headers);
  };

  const server = createServer((request, response) => {
    answer(request, response).catch((error: unknown) => {
      console.error('[netlify-site]', request.method, request.url, error);
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  });
  try {
    await new Promise<void>((listening, refused) => {
      server.once('error', refused);
      server.listen(port, LOOPBACK, () => listening());
    });
  } catch (error) {
    await functions.close();
    throw error;
  }
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  return {
    origin: `http://${LOOPBACK}:${boundPort}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((closed) => server.close(closed));
      await functions.close();
    },
  };
}
