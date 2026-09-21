// Chrome's "Always use secure connections" setting (HTTPS-First) puts a
// full-page "This site doesn't support a secure connection" warning in front of
// a plain-http origin, and nothing on the host can see it: the page simply never
// reports in, and the runner blames the network. Chrome exempts localhost, so a
// page THIS host serves reaches Android Chrome at localhost through
// `adb reverse`, not at the LAN address the iPad needs. Localhost is also a
// secure context, as the production https origin is and the LAN origin was not.
import { lanAddresses } from '../../lib/net.mjs';
import { capture, tryCapture } from '../../lib/proc.mjs';

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

// Null for a URL the device cannot be routed to over adb: another machine, or
// an origin that is not plain http.
export function androidLocalhostRoute(url, hostAddresses = lanAddresses()) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !parsed.port) return null;
  const servedHere =
    LOOPBACK_HOSTNAMES.includes(parsed.hostname) || hostAddresses.includes(parsed.hostname);
  if (!servedHere) return null;
  parsed.hostname = 'localhost';
  return { url: parsed.toString(), port: Number(parsed.port) };
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
export function reverseToLocalhost(url, run, hostAddresses = lanAddresses()) {
  const route = androidLocalhostRoute(url, hostAddresses);
  if (!route) return { url, release: () => {} };
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off('exit', release);
    run(['reverse', '--remove', `tcp:${route.port}`], { bestEffort: true });
  };
  run(['reverse', `tcp:${route.port}`, `tcp:${route.port}`], { bestEffort: false });
  process.once('exit', release);
  return { url: route.url, release };
}
