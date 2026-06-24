// Guard for `npm run dev:netlify`: the script runs the bare `netlify dev`
// command, which needs the Netlify CLI on PATH, an authenticated session, AND a
// linked project. The CLI is installed globally (it's not a project dependency —
// see docs/CONTRIBUTING.md), so a fresh machine hits a cryptic
// `sh: netlify: command not found`. When the CLI is present but logged out or the
// folder isn't linked to a Netlify project, `netlify dev` still boots, but it
// can't pull the site's env vars or Blobs context, so Netlify Blobs degrades
// silently to an in-memory fallback (ADR-0025) — token/usage edits look like they
// save but don't. Each failure mode is turned into an actionable message before
// `netlify dev` runs.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { hasCommand, fail, isWindows, ROOT } from './lib/utils.mjs';

if (!hasCommand('netlify')) {
  fail(
    [
      '[dev:netlify] Netlify CLI not found on PATH.',
      '  Install it globally:  npm install -g netlify-cli',
    ].join('\n')
  );
}

// One `netlify status` call covers both the login and link checks. Run it from
// web/ so it resolves the project exactly as `netlify dev --cwd web` does, and
// capture its output instead of inheriting it so the check stays quiet on the
// happy path. The CLI exits 0 even when logged out or unlinked, so match on the
// message text rather than the exit code.
const status = spawnSync(isWindows ? 'netlify.cmd' : 'netlify', ['status'], {
  cwd: join(ROOT, 'web'),
  encoding: 'utf8',
});
const output = `${status.stdout ?? ''}${status.stderr ?? ''}`;

if (/Not logged in/i.test(output)) {
  fail(
    [
      '[dev:netlify] Not logged in to Netlify.',
      '  Netlify Blobs needs an authenticated session — without it, the /admin',
      '  token list silently falls back to an in-memory copy (ADR-0025) and your',
      '  edits will NOT persist.',
      '',
      '  Log in with:           netlify login',
      '  Then start dev again:  npm run dev:netlify',
    ].join('\n')
  );
}

if (/linked to a project|netlify link/i.test(output)) {
  fail(
    [
      '[dev:netlify] This folder is not linked to a Netlify project.',
      "  Without a link, dev can't load the site's env vars or Blobs context, so",
      '  the /admin token list silently falls back to an in-memory copy (ADR-0025)',
      '  and your edits will NOT persist.',
      '',
      '  Link it with:          netlify link',
      '  Then start dev again:  npm run dev:netlify',
    ].join('\n')
  );
}
