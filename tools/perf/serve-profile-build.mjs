// Serves the current production build on the LAN for on-device profiling, and
// prints one reachable URL instead of vite's one-per-bound-interface list — see
// docs/PROFILING-IPAD.md.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import {
  ROOT,
  TCP_PORT,
  argNumber,
  argSwitch,
  fail,
  isMain,
  rejectUnknownFlags,
  runMain,
} from '../lib/proc.mjs';
import { lanAddresses } from '../lib/net.mjs';
import { buildDirHoldsNativeExport } from './lib/build-variant.mjs';
import { PREVIEW_PORT } from './lib/perf-serve.mjs';

export function runPerfServe({ port = PREVIEW_PORT, strictPort = false } = {}) {
  if (buildDirHoldsNativeExport()) {
    fail(
      'web/build holds the native static export, not the web build — a native build ' +
        '(build:cap, ios:run:device, android:run) overwrote it. A capture against it hangs ' +
        'rather than failing. Run `npm run perf:build` first.'
    );
  }
  const addresses = lanAddresses();
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'tools', 'run-web-tool.mjs'),
      'vite',
      'preview',
      '--host',
      '--port',
      String(port),
      // A caller that derived a URL from `port` before starting the server
      // can't discover a fall-forward, so it asks to fail loudly instead.
      ...(strictPort ? ['--strictPort'] : []),
    ],
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
    const plain = stripVTControlCharacters(line);
    if (announced && plain.includes('Network:')) return;
    process.stdout.write(`${line}\n`);
    if (announced || !addresses.length || !plain.includes('Local:')) return;
    announced = true;
    // vite falls forward to the next free port when the requested one is taken,
    // so take the port it actually bound rather than the one we asked for.
    const boundPort = plain.match(/:(\d+)\//)?.[1] ?? String(port);
    for (const address of addresses) {
      process.stdout.write(`  ➜  Network: http://${address}:${boundPort}/\n`);
      process.stdout.write(`  ➜  Harness: http://${address}:${boundPort}/dev/engine\n`);
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

// A spawning caller passes --strict-port because it derived a URL from --port
// before the server existed; a human running `npm run perf:serve` keeps the
// fall-forward and reads the port off the printed Network line.
if (isMain(import.meta.url)) {
  rejectUnknownFlags(['port', 'strict-port']);
  runMain(() =>
    runPerfServe({
      port: argNumber('port', PREVIEW_PORT, TCP_PORT),
      strictPort: argSwitch('strict-port'),
    })
  );
}
