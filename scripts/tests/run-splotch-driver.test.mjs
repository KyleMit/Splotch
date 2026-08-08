import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The run-splotch driver is the script its own SKILL.md tells every agent to run,
// and that SKILL.md forbids exactly one thing: hand-rolling the dev server with
// `spawn('npx', ['vite', 'dev', …])` + child.kill(). npx exits while the real vite
// keeps the port, and the piped stdout stops the driver's event loop from draining
// — the run hangs and leaves a `vite dev` on port 5199 for hours. So the driver
// goes through scripts/lib/vite-server.mjs, whose detached process group makes
// stop() reap the process that actually holds the port.
//
// Regex-level on purpose: this Node-only suite parses nothing, and importing the
// driver would launch a browser. Comments are stripped first so the driver can
// keep naming the anti-pattern in the WHY comment that explains the helper.
const repoRoot = join(import.meta.dirname, '..', '..');
const VITE_SERVER = realpathSync(join(repoRoot, 'scripts', 'lib', 'vite-server.mjs'));

// Every generated copy, because each one is a script an agent is told to run and
// the shared import specifier is relative — it has to resolve from all of them.
const DRIVERS = [
  '.ruler/skills/run-splotch/driver.mjs',
  '.claude/skills/run-splotch/driver.mjs',
  '.agents/skills/run-splotch/driver.mjs',
].map((path) => ({ path, source: readFileSync(join(repoRoot, path), 'utf8') }));

/** Line comments dropped, leaving `://` in URLs alone. */
const code = (source) => source.replace(/(^|[^:])\/\/.*$/gm, '$1');

describe.each(DRIVERS)('run-splotch driver $path', ({ path, source }) => {
  const body = code(source);

  it('imports spawnViteServer over a specifier that resolves from this copy', () => {
    const match = body.match(/import \{([^}]*)\} from '([^']*vite-server\.mjs)';/);
    expect(match?.[1]).toContain('spawnViteServer');
    expect(realpathSync(resolve(dirname(join(repoRoot, path)), match[2]))).toBe(VITE_SERVER);
  });

  // The invariant is that the driver reaches for no child-process API at all, not
  // that it avoids one spelling: `execFile('npx', ['vite', 'dev', …])` torn down
  // with `kill-port` is the same orphaning hand-roll and slips past a bare
  // `spawn(` / `.kill(` grep. Every such API has to name the module it comes
  // from, so the import is the chokepoint that closes the whole family.
  it('reaches for no child-process API of its own', () => {
    expect(body).not.toMatch(/child_process/);
    expect(body).not.toMatch(/(^|[^\w.])(spawn|exec|execFile|fork)(Sync)?\(/);
  });

  it('tears the server down through the helper instead of a bare kill', () => {
    expect(body).not.toMatch(/\.kill\(/);
    expect(body).toContain('.stop()');
    expect(body).toContain('.release()');
  });

  it('never clears an occupied port', () => {
    expect(body).not.toMatch(/kill-port|freePort/);
  });

  it('prints the recorded process group for a kept server', () => {
    expect(body).toContain('kill -- -${vite.server.pid}');
  });
});
