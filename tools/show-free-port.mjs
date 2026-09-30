import { createServer } from 'node:net';
import { parseArgs } from 'node:util';
import { isMain, parseNumberFlag, runMain, TCP_PORT } from './lib/proc.mjs';

const DEFAULT_FROM_PORT = 5300;
const DEFAULT_TO_PORT = 5399;

function probeAddress(port, host, allowUnavailable) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else if (
        allowUnavailable &&
        (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT')
      )
        resolve(true);
      else reject(error);
    });
    server.listen({ port, host }, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

export async function probePort(port, host = 'localhost') {
  const addresses = host === 'localhost' ? ['127.0.0.1', '::1'] : [host];
  for (const address of addresses) {
    if (!(await probeAddress(port, address, host === 'localhost' && address === '::1')))
      return false;
  }
  return true;
}

export async function findFreePort({
  from = DEFAULT_FROM_PORT,
  to = DEFAULT_TO_PORT,
  host = 'localhost',
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
  const from =
    values.from === undefined ? DEFAULT_FROM_PORT : parseNumberFlag('from', values.from, TCP_PORT);
  const to = values.to === undefined ? DEFAULT_TO_PORT : parseNumberFlag('to', values.to, TCP_PORT);
  const port = await findFreePort({ from, to, host: values.host });
  console.log(port);
}

if (isMain(import.meta.url)) runMain(showFreePort);
