import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { sleep } from './proc.mjs';

const POLL_INTERVAL_MS = 500;
const DEFAULT_FROM_PORT = 5300;
const DEFAULT_TO_PORT = 5399;

// 169.254.0.0/16 — what an interface self-assigns when no DHCP server answered.
// It has no gateway and routes nowhere, but macOS puts one on the virtual
// interface it creates for a USB-tethered iOS device, so `vite --host` happily
// advertises it next to the real LAN address.
const LINK_LOCAL_PREFIX = '169.254.';

// Node binds with SO_REUSEADDR, and macOS then lets a bind on one address succeed beside a listener
// on another (loopback beside wildcard, wildcard beside loopback or a LAN address). Only a bind on
// the holder's own address fails there, so the probe tries every address a listener could hold.
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];
const WILDCARD_ADDRESSES = ['::', '0.0.0.0'];

// The addresses another device on the same Wi-Fi can actually reach this
// machine at, in OS-reported order (the primary interface leads).
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (addr) =>
        addr?.family === 'IPv4' && !addr.internal && !addr.address.startsWith(LINK_LOCAL_PREFIX)
    )
    .map((addr) => addr.address);
}

// Poll a URL until `ready(res)` (plain HTTP reachability by default) or throw
// at the deadline, with the last attempt's failure as the error's cause. The
// deadline also aborts the attempt in flight: fetch's own headers timeout is far
// longer, so a server that accepts and never answers would otherwise outlast it.
export async function waitForUrl(url, timeoutMs, ready = (res) => res.ok) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure;
  while (Date.now() < deadline) {
    try {
      const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      const res = await fetch(url, { signal });
      if (ready(res)) return;
      lastFailure = new Error(`answered HTTP ${res.status}`);
    } catch (err) {
      lastFailure = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms`, { cause: lastFailure });
}

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

function interfaceAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses = []]) =>
    addresses.map(({ address, scopeid }) => (scopeid ? `${address}%${name}` : address))
  );
}

function probeAddresses(host) {
  const named = host === 'localhost' ? LOOPBACK_ADDRESSES : [host];
  return [...new Set([...named, ...WILDCARD_ADDRESSES, ...interfaceAddresses()])];
}

export async function portIsFree(port, host = 'localhost') {
  for (const address of probeAddresses(host)) {
    // An address this host cannot bind (no IPv6, a vanished interface) cannot hold a listener
    // either; only an explicitly named host must be bindable.
    if (!(await probeAddress(port, address, address !== host))) return false;
  }
  return true;
}

// `probe` is a test seam: the search's tests substitute a probe that reports chosen ports free.
export async function findFreePort({
  from = DEFAULT_FROM_PORT,
  to = DEFAULT_TO_PORT,
  host = 'localhost',
  probe = portIsFree,
} = {}) {
  if (from > to) throw new Error(`Reversed port range: from ${from} is greater than to ${to}`);
  for (let port = from; port <= to; port++) {
    if (await probe(port, host)) return port;
  }
  throw new Error(`No free port from ${from} to ${to} on ${host}`);
}
