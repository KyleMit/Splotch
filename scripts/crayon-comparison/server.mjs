import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function freePort(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const value of (result.stdout ?? '').split('\n').filter(Boolean)) {
    try {
      process.kill(Number(value), 'SIGTERM');
    } catch {}
  }
}

export function spawnViteServerAt(worktree, port, env = {}) {
  const vite = join(worktree, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [vite, 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: join(worktree, 'web'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'inherit'],
      detached: true,
    }
  );
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  };
  return { child, stop };
}
