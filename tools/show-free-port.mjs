import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
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

// Node binds with SO_REUSEADDR, and macOS then lets a bind on one address succeed beside a listener
// on another (loopback beside wildcard, wildcard beside loopback or a LAN address). Only a bind on
// the holder's own address fails there, so the probe tries every address a listener could hold.
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];
const WILDCARD_ADDRESSES = ['::', '0.0.0.0'];

function interfaceAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses = []]) =>
    addresses.map(({ address, scopeid }) => (scopeid ? `${address}%${name}` : address))
  );
}

function probeAddresses(host) {
  const named = host === 'localhost' ? LOOPBACK_ADDRESSES : [host];
  return [...new Set([...named, ...WILDCARD_ADDRESSES, ...interfaceAddresses()])];
}

export async function probePort(port, host = 'localhost') {
  for (const address of probeAddresses(host)) {
    // An address this host cannot bind (no IPv6, a vanished interface) cannot hold a listener
    // either; only an explicitly named host must be bindable.
    if (!(await probeAddress(port, address, address !== host))) return false;
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
