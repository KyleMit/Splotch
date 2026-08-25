// Serve the perf build with the real-screen probe bootstrapped into the page.
//
//   npm run perf:device:serve -- --port=4175 --upstream=http://127.0.0.1:4173
//
// Binds 0.0.0.0 on purpose: a physical device loads this over the LAN, so the
// host has to be reachable from off-box. Pair it with `perf:device:frames`,
// which drives the touch input and reads the report back.
import { join } from 'node:path';
import { argFlag, isMain, ROOT, runMain } from '../../lib/proc.mjs';
import { createProbeHost } from './lib/probe-host.mjs';

export const DEFAULT_PROBE_PORT = 4175;
const DEFAULT_UPSTREAM = 'http://127.0.0.1:4173';
const DEFAULT_REPORT_DIR = join(ROOT, 'perf-profiles', 'split-capture', 'reports');

export function serveProbeHost({
  port = Number(argFlag('port', DEFAULT_PROBE_PORT)),
  upstream = argFlag('upstream', DEFAULT_UPSTREAM),
  reportDir = argFlag('report-dir', DEFAULT_REPORT_DIR),
} = {}) {
  const { server } = createProbeHost({ upstream, reportDir });
  server.listen(port, '0.0.0.0', () => console.log(`probe host on ${port}, proxying ${upstream}`));
  return server;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    serveProbeHost();
  });
}
