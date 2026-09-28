// The perf:serve preview server (serve-profile-build.mjs) as a child process,
// for a capture that needs it running for the length of its own run.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { PORT_ROLES } from './capture-readiness.mjs';

const SERVE_ENTRY = join(ROOT, 'tools', 'perf', 'serve-profile-build.mjs');

// vite's default preview port. The runbook, the console driver, and the
// recorder snippet all point the iPad at it.
export const PREVIEW_PORT = PORT_ROLES.preview.port;

// For a script that needs the server running for the length of its own run
// (perf:ios:webkit:gates). It goes into its own process group so stop() reaches
// the vite grandchild the entry spawns rather than orphaning it on the port.
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
