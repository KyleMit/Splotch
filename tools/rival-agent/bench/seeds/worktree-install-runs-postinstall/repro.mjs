// Fails when the disposable worktree's install lets a package's postinstall run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { WORKTREE_INSTALL_ARGS } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/worktree.mjs')).href
);
const project = mkdtempSync(join(tmpdir(), 'rival-bench-postinstall-'));
writeFileSync(
  join(project, 'package.json'),
  JSON.stringify({
    name: 'probe',
    private: true,
    version: '0.0.0',
    scripts: { postinstall: "node -e \"require('node:fs').writeFileSync('hook.marker', 'ran')\"" },
  })
);
const pnpm = (args) => spawnSync('pnpm', args, { cwd: project, encoding: 'utf8' });
const lock = pnpm(['install', '--lockfile-only', '--ignore-scripts']);
if (lock.status !== 0) throw new Error(`lockfile: ${lock.stderr}`);
const install = pnpm([...WORKTREE_INSTALL_ARGS]);
if (install.status !== 0) throw new Error(`install: ${install.stderr}`);
if (existsSync(join(project, 'hook.marker'))) {
  throw new Error('postinstall ran during the disposable worktree install');
}
