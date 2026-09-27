import { createServer } from 'node:net';
import { parseArgs } from 'node:util';
import { isMain, runMain } from './lib/proc.mjs';

const DEFAULT_FROM_PORT = 5300;
const DEFAULT_TO_PORT = 5399;
const MAX_PORT = 65535;

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT || String(port) !== value) {
    throw new Error(`${name} must be an integer from 1 to ${MAX_PORT}`);
  }
  return port;
}

export function probePort(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen({ port, host }, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

export async function findFreePort({
  from = DEFAULT_FROM_PORT,
  to = DEFAULT_TO_PORT,
  host = '127.0.0.1',
  probe = probePort,
} = {}) {
  if (from > to) throw new Error('--from must be no greater than --to');
  for (let port = from; port <= to; port++) {
    if (await probe(port, host)) return port;
  }
  throw new Error(`No free port from ${from} to ${to} on ${host}`);
}

export async function showFreePort(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { from: { type: 'string' }, to: { type: 'string' }, host: { type: 'string' } },
    allowPositionals: false,
  });
  if (positionals.length) throw new Error('Unexpected positional arguments');
  const from = values.from === undefined ? DEFAULT_FROM_PORT : parsePort(values.from, '--from');
  const to = values.to === undefined ? DEFAULT_TO_PORT : parsePort(values.to, '--to');
  const port = await findFreePort({ from, to, host: values.host });
  console.log(port);
}

if (isMain(import.meta.url)) runMain(showFreePort);
