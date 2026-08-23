// Serves the current production build on the LAN for on-device profiling, and
// prints one reachable URL instead of vite's one-per-bound-interface list — see
// docs/PROFILING-IPAD.md.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { lanAddresses } from '../lib/net.mjs';
import { WEB_ONLY_STATIC_FILES } from '../mobile/lib/static-export.mjs';

const SERVE_ENTRY = join(ROOT, 'tools', 'perf', 'serve-profile-build.mjs');

// vite's default preview port. The runbook, the console driver, and the
// recorder snippet all point the iPad at it.
const PREVIEW_PORT = 4173;

// The escape byte is the point: we match vite's SGR color codes to read the
// address lines underneath them, while forwarding the line still colored.
// eslint-disable-next-line no-control-regex
const stripAnsi = (line) => line.replace(/\u001B\[[0-9;]*m/g, '');

// `build:cap` writes the native static export into the SAME `web/build` directory
// the web build uses, so running any native build silently replaces what this
// server serves. The freshness check in lib/profile-preview.mjs cannot catch it —
// the served entry genuinely is in web/build — and a capture against the export
// does not fail, it HANGS: the drawing route never reports ready and the runner
// waits. Observed 2026-08-23, where `ios:run:device` left the export in place and
// the next desktop cell sat at 0% CPU for eleven minutes.
//
// The export is defined by what it drops, so the web-only files are the
// discriminator, read from the list the strip itself works from rather than
// duplicated here.
export function buildDirHoldsNativeExport(buildDir = join(ROOT, 'web', 'build')) {
  if (!existsSync(join(buildDir, 'index.html'))) return false;
  return WEB_ONLY_STATIC_FILES.every((file) => !existsSync(join(buildDir, file)));
}

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
    const plain = stripAnsi(line);
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

// The same server as a child process, for a script that needs it running for
// the length of its own run (perf:ios:webkit:gates). It goes into its own process group so
// stop() reaches the vite grandchild this module spawns rather than orphaning
// it on the port.
export function spawnPerfServe(port = PREVIEW_PORT) {
  const child = spawn(process.execPath, [SERVE_ENTRY, `--port=${port}`, '--strict-port'], {
    cwd: ROOT,
    env: { ...process.env, PUBLIC_ENABLE_DEV_HARNESS: 'true' },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });

  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }
  };
  process.on('exit', stop);

  return { child, stop };
}

// A spawning caller passes --strict-port because it derived a URL from --port
// before the server existed; a human running `npm run perf:serve` keeps the
// fall-forward and reads the port off the printed Network line.
if (isMain(import.meta.url)) {
  runMain(() =>
    runPerfServe({
      port: Number(argFlag('port', PREVIEW_PORT)),
      strictPort: process.argv.includes('--strict-port'),
    })
  );
}
