// Serves the current production build on the LAN for on-device profiling, and
// prints one reachable URL instead of vite's one-per-bound-interface list — see
// the profiling skill's ipad-device-profiling.md.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { lanAddresses } from '../lib/net.mjs';

// vite's default preview port. The runbook, the console driver, and the
// recorder snippet all point the iPad at it.
const PREVIEW_PORT = 4173;

// The escape byte is the point: we match vite's SGR color codes to read the
// address lines underneath them, while forwarding the line still colored.
// eslint-disable-next-line no-control-regex
const stripAnsi = (line) => line.replace(/\u001B\[[0-9;]*m/g, '');

export function runPerfServe() {
  const addresses = lanAddresses();
  const child = spawn(
    process.execPath,
    [join(ROOT, 'scripts', 'web.mjs'), 'vite', 'preview', '--host', '--port', String(PREVIEW_PORT)],
    {
      cwd: ROOT,
      // vite drops color when its stdout is a pipe rather than a terminal, and
      // this wrapper always pipes so it can rewrite the address lines.
      env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
      stdio: ['inherit', 'pipe', 'inherit'],
    }
  );

  let announced = false;
  let pending = '';

  const forward = (line) => {
    const plain = stripAnsi(line);
    if (announced && plain.includes('Network:')) return;
    process.stdout.write(`${line}\n`);
    if (announced || !addresses.length || !plain.includes('Local:')) return;
    announced = true;
    // vite falls forward to the next free port when PREVIEW_PORT is taken, so
    // take the port it actually bound rather than the one we asked for.
    const port = plain.match(/:(\d+)\//)?.[1] ?? String(PREVIEW_PORT);
    for (const address of addresses) {
      process.stdout.write(`  ➜  Network: http://${address}:${port}/\n`);
      process.stdout.write(`  ➜  Harness: http://${address}:${port}/dev/engine\n`);
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) forward(line);
  });

  // Never resolves: the server runs until the operator stops it, and the exit
  // handler takes the process down with vite's own status.
  return new Promise((_resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (pending) process.stdout.write(pending);
      process.exit(signal ? 1 : (code ?? 0));
    });
  });
}

if (isMain(import.meta.url)) runMain(runPerfServe);
