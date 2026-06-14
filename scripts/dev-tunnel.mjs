// Starts `vite dev --host` and exposes it on a public https://*.trycloudflare.com
// URL via a Cloudflare quick tunnel, so the running dev server is viewable on a
// phone (or any device) without being on the same network. No Cloudflare account
// needed. See scripts/CLAUDE.md and the mobile guide.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { bin, install, tunnel } from 'cloudflared';

const PORT = Number(process.env.PORT) || 5173;
const ORIGIN = `http://localhost:${PORT}`;
const isWin = process.platform === 'win32';

const children = [];
let stopTunnel;

function shutdown(code = 0) {
  try {
    stopTunnel?.();
  } catch {}
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

if (!existsSync(bin)) {
  console.log('Downloading the cloudflared binary (first run only)…');
  await install(bin);
}

const vite = spawn('npm', ['run', 'dev:host'], { stdio: 'inherit', shell: isWin });
children.push(vite);
vite.on('exit', (code) => shutdown(code ?? 0));

if (!(await waitForServer())) {
  console.error(`\nDev server never came up on ${ORIGIN}. Aborting tunnel.`);
  shutdown(1);
}

// --protocol http2 keeps the edge connection on plain HTTPS/443, the most likely
// to survive a restrictive network (corporate proxy / egress allowlist).
const quick = tunnel({ '--url': ORIGIN, '--protocol': 'http2' });
stopTunnel = quick.stop;

try {
  const url = await Promise.race([
    quick.url,
    sleep(30_000).then(() => Promise.reject(new Error('timeout'))),
  ]);
  const banner = '═'.repeat(Math.max(url.length, 28) + 6);
  console.log(`\n${banner}\n   View on your phone:\n   ${url}\n${banner}\n`);
} catch {
  console.error(
    '\nCould not open the Cloudflare tunnel. The network is likely blocking it.\n' +
      'If you are in a restricted environment (e.g. a Claude Code cloud session),\n' +
      'add these hosts to the network egress allowlist and retry:\n' +
      '  api.trycloudflare.com, *.argotunnel.com, *.v2.argotunnel.com\n' +
      'Otherwise run this from a machine with normal internet access.\n',
  );
  shutdown(1);
}
