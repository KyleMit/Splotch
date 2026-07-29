import { networkInterfaces } from 'node:os';
import { sleep } from './proc.mjs';

// 169.254.0.0/16 — what an interface self-assigns when no DHCP server answered.
// It has no gateway and routes nowhere, but macOS puts one on the virtual
// interface it creates for a USB-tethered iOS device, so `vite --host` happily
// advertises it next to the real LAN address.
const LINK_LOCAL_PREFIX = '169.254.';

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
// at the deadline.
export async function waitForUrl(url, timeoutMs, ready = (res) => res.ok) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (ready(await fetch(url))) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms`);
}
