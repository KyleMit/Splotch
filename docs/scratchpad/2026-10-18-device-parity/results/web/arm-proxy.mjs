// A pass-through proxy in front of one arm, so a cell can stand up "the next deploy" for either
// arm the same way: replace a path's bytes (a changed sw.js, a bumped version.json) while every
// other request reaches the arm unchanged. Each proxy is its own origin, so its service worker and
// storage start empty.
import { createServer, request as httpRequest } from 'node:http';

export async function startArmProxy(upstream, port = 0) {
  const target = new URL(upstream);
  const overrides = new Map();
  const log = [];
  const server = createServer((incoming, outgoing) => {
    const { pathname } = new URL(incoming.url ?? '/', 'http://proxy');
    const override = overrides.get(pathname);
    if (override) {
      log.push({ pathname, status: 200, override: true, at: Date.now() });
      outgoing.writeHead(200, {
        'Content-Type': override.contentType,
        'Cache-Control': 'no-cache',
      });
      outgoing.end(override.body);
      return;
    }
    const forwarded = httpRequest(
      {
        host: target.hostname,
        port: target.port,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, host: target.host },
      },
      (response) => {
        log.push({ pathname, status: response.statusCode, at: Date.now() });
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      }
    );
    forwarded.on('error', () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(forwarded);
  });
  await new Promise((ready) => server.listen(port, '127.0.0.1', ready));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    log,
    override(pathname, body, contentType) {
      overrides.set(pathname, { body, contentType });
    },
    clear() {
      overrides.clear();
    },
    async fetchUpstream(pathname) {
      const response = await fetch(new URL(pathname, upstream));
      return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
    },
    close: () => new Promise((done) => server.close(done)),
  };
}
