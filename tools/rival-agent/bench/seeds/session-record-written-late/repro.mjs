// Fails when session.json is absent after provisioning fails: the broker sees "no session" instead
// of a failed session. A temp repository with a dependency and no lockfile makes the frozen install
// fail before any rival starts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { launch } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/launch.mjs')).href
);
const root = mkdtempSync(join(tmpdir(), 'rival-bench-session-'));
const repo = join(root, 'repo');
mkdirSync(repo);
const git = (args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
git(['init', '-q', '-b', 'main']);
writeFileSync(
  join(repo, 'package.json'),
  JSON.stringify({ name: 'probe', private: true, dependencies: { 'left-pad': '1.3.0' } })
);
git(['add', 'package.json']);
git(['commit', '-q', '-m', 'one']);
const vendor = {
  rival: 'probe',
  command: 'true',
  prepare: () => ({ env: process.env }),
  resolveModel: () => 'none',
  localToolBoundary: 'none',
  buildArgs: () => [],
  reducer: { initial: () => ({}), reduce: (state) => state, render: () => null },
};
let session;
try {
  await launch(
    {
      scope: { kind: 'uncommitted' },
      cwd: repo,
      effort: 'low',
      sandbox: 'read-only',
      fresh: true,
      endSession: false,
    },
    vendor,
    {
      onProgress: (line) => {
        if (line.startsWith('session: ')) session = line.slice('session: '.length);
      },
    }
  );
  throw new Error('the frozen install was expected to fail without a lockfile');
} catch (error) {
  if (!/pnpm install failed/.test(error.message)) throw error;
  if (!session) {
    throw new Error(`no session line before the failure: ${error.message}`, { cause: error });
  }
  const present = existsSync(join(session, 'session.json'));
  rmSync(session, { recursive: true, force: true });
  if (!present) {
    throw new Error('session.json was not written before provisioning failed', { cause: error });
  }
}
