// Chrome's "Always use secure connections" setting (HTTPS-First) puts a
// full-page "This site doesn't support a secure connection" warning in front of
// a plain-http origin, and nothing on the host can see it: the page simply never
// reports in, and the runner blames the network. Chrome exempts localhost, so a
// page THIS host serves reaches Android Chrome at localhost through
// `adb reverse`, not at the LAN address the iPad needs. Localhost is also a
// secure context, as the production https origin is and the LAN origin was not.
import { lookup as dnsLookup } from 'node:dns/promises';
import { networkInterfaces } from 'node:os';
import { capture, tryCapture } from '../../lib/proc.mjs';
import { rethrowIfBroken } from './error-classification.mjs';

// Every interface, internal and link-local included: the question is whether a
// URL names this machine, not whether another device could reach it.
function interfaceAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((entry) => entry.address);
}

async function resolveAll(hostname) {
  const answers = await dnsLookup(hostname, { all: true });
  return answers.map((answer) => answer.address);
}

// A name (`my-mac.local`) counts only when every address it resolves to is one
// of this machine's; an unresolvable name counts as elsewhere.
async function namesThisHost(hostname, { hostAddresses, lookup }) {
  if (hostname === 'localhost' || hostAddresses.includes(hostname)) return true;
  let addresses;
  try {
    addresses = await lookup(hostname);
  } catch (error) {
    rethrowIfBroken(error);
    return false;
  }
  return addresses.length > 0 && addresses.every((address) => hostAddresses.includes(address));
}

// Null for a URL the device cannot be routed to over adb: another machine, or
// an origin that is not plain http on an explicit port.
export async function androidLocalhostRoute(
  url,
  { hostAddresses = interfaceAddresses(), lookup = resolveAll } = {}
) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !parsed.port) return null;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!(await namesThisHost(hostname, { hostAddresses, lookup }))) return null;
  parsed.hostname = 'localhost';
  return { url: parsed.toString(), port: Number(parsed.port), hostname };
}

// The runner for tools that call `adb` from PATH. A failed bind exits through
// capture(); a failed removal is returned, never thrown.
export const adbRunner =
  (serial) =>
  (args, { bestEffort }) =>
    (bestEffort ? tryCapture : capture)('adb', ['-s', serial, ...args]);

// `run(args, { bestEffort })` executes `adb -s <serial> ...args`; removal is
// best-effort so a cleanup failure cannot mask the error that caused it. The
// release is also armed on process exit, because the capture tools fail through
// process.exit, which skips every finally.
//
// `toolingHostnames` is every name this host's tooling pages can be open under
// on the device — localhost now, and the LAN addresses earlier runs used — so a
// litter sweep still recognizes a tab left by a run from before the route.
export async function reverseToLocalhost(
  url,
  run,
  { hostAddresses = interfaceAddresses(), lookup = resolveAll } = {}
) {
  const route = await androidLocalhostRoute(url, { hostAddresses, lookup });
  if (!route) {
    console.log(
      `${new URL(url).origin} is not served by this machine, so Chrome loads it as given — ` +
        'with "Always use secure connections" on, it shows a warning page instead'
    );
    return { url, toolingHostnames: [new URL(url).hostname], release: () => {} };
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off('exit', release);
    run(['reverse', '--remove', `tcp:${route.port}`], { bestEffort: true });
  };
  run(['reverse', `tcp:${route.port}`, `tcp:${route.port}`], { bestEffort: false });
  process.once('exit', release);
  const toolingHostnames = [...new Set(['localhost', route.hostname, ...hostAddresses])];
  return { url: route.url, toolingHostnames, release };
}
