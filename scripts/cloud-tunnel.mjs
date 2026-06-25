#!/usr/bin/env node
// Cloud session only: bring up the phone-preview reverse tunnel in one command (ADR-0021).
// Starts `vite dev` (localhost:5173) and a chisel client that reverse-forwards the Fly relay
// to it, waits for the public URL to answer 200, prints it, and holds both processes open
// until Ctrl-C. Off-cloud you don't need this — any quick tunnel works (see docs/CLOUD.md).
//
// Requires TUNNEL_AUTH (the chisel shared secret) in the environment. TUNNEL_HOST defaults to
// the relay hostname from ADR-0021 and can be overridden. The chisel binary is resolved from
// PATH (cached by .claude/cloud/setup.sh), or CHISEL_BIN, or /tmp/chisel.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/utils.mjs';

const TUNNEL_HOST = process.env.TUNNEL_HOST || 'splotch-tunnel-kyle.fly.dev';
const TUNNEL_AUTH = process.env.TUNNEL_AUTH;
const PORT = 5173;
const REMOTE_PORT = 9000;
const PUBLIC_URL = `https://${TUNNEL_HOST}`;

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

if (!TUNNEL_AUTH) {
  die(
    'TUNNEL_AUTH is not set. It must match the Fly relay AUTH secret — set it in the\n' +
      '  Claude Code env config (see .claude/cloud/environment.example).'
  );
}

function resolveChisel() {
  if (process.env.CHISEL_BIN) return process.env.CHISEL_BIN;
  for (const candidate of ['/usr/local/bin/chisel', '/tmp/chisel']) {
    if (existsSync(candidate)) return candidate;
  }
  return 'chisel'; // assume on PATH
}

async function waitFor(label, probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms`);
}

const children = [];
function shutdown(code) {
  for (const c of children) c.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function track(name, child) {
  children.push(child);
  child.on('exit', (code) => {
    console.error(`\n✗ ${name} exited (code ${code}); shutting down.`);
    shutdown(1);
  });
  return child;
}

try {
  console.log('Starting vite dev…');
  track(
    'vite',
    spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
      cwd: join(ROOT, 'web'),
      // TUNNEL_HOST drives vite's server.allowedHosts (vite.config.ts) so the tunnel host is
      // accepted; --host is intentionally omitted (chisel forwards via localhost).
      env: { ...process.env, TUNNEL_HOST },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  );
  await waitFor(
    'vite',
    async () => {
      try {
        return (await fetch(`http://localhost:${PORT}/`)).ok;
      } catch {
        return false;
      }
    },
    60_000
  );
  console.log(`✓ vite ready on http://localhost:${PORT}\n`);

  const chisel = resolveChisel();
  console.log(`Connecting chisel client (${chisel}) → ${PUBLIC_URL}…`);
  track(
    'chisel',
    spawn(
      chisel,
      [
        'client',
        '--auth',
        TUNNEL_AUTH,
        '--keepalive',
        '25s',
        PUBLIC_URL,
        `R:127.0.0.1:${REMOTE_PORT}:localhost:${PORT}`,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    )
  );
  await waitFor(
    'public URL',
    async () => {
      try {
        return (await fetch(`${PUBLIC_URL}/`)).status === 200;
      } catch {
        return false;
      }
    },
    60_000
  );

  console.log(`\n  ➜  Live:  ${PUBLIC_URL}\n`);
  console.log('Tunnel is up. Open the URL on your phone. Ctrl-C to stop.\n');
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  shutdown(1);
}
