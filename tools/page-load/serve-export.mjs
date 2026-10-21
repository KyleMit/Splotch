#!/usr/bin/env node

// The page-load gate's host: the published React Native web export on one loopback origin, as the
// Netlify deploy serves it. The site is e2e/server's (netlify.toml's headers, redirects and 404,
// the /api function), behind the edge behaviors that site omits (lib/edge-proxy.mjs).
// `node --experimental-strip-types tools/page-load/serve-export.mjs --port <port>`, which runs until
// stopped. The runner adds the stop flag and keeps the pipe open, so the host goes when
// the runner does, however the runner went; a shell that closes stdin would stop it at once.

import { parseArgs } from 'node:util';
import { startNetlifySite } from '../../e2e/server/netlifySite.ts';
import { E2E_SERVER_ENV } from '../../e2e/server/serverEnv.ts';
import { TCP_PORT, parseNumberFlag } from '../lib/proc.mjs';
import { createEdgeProxy } from './lib/edge-proxy.mjs';
import { EXPORT_HOST_READY_PREFIX, EXPORT_HOST_STOP_FLAG } from './lib/export-host.mjs';

const LOOPBACK = '127.0.0.1';

const { values } = parseArgs({
  options: { port: { type: 'string' }, [EXPORT_HOST_STOP_FLAG]: { type: 'boolean' } },
});
if (values.port === undefined) throw new Error('serve-export.mjs needs --port <port>');
const port = parseNumberFlag('port', values.port, TCP_PORT);

const site = await startNetlifySite({ port: 0, env: E2E_SERVER_ENV });
const edge = createEdgeProxy(site.origin);
try {
  await new Promise((listening, refused) => {
    edge.once('error', refused);
    edge.listen(port, LOOPBACK, () => listening());
  });
} catch (error) {
  await site.close();
  throw error;
}
console.log(`${EXPORT_HOST_READY_PREFIX}http://${LOOPBACK}:${port}/`);

function shutDown() {
  edge.closeAllConnections();
  edge.close();
  void site.close().then(() => process.exit(0));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutDown);
if (values[EXPORT_HOST_STOP_FLAG]) {
  process.stdin.once('end', shutDown);
  process.stdin.resume();
}
