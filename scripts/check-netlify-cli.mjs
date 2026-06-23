// Guard for `npm run dev:netlify`: the script runs the bare `netlify dev`
// command, which needs the Netlify CLI on PATH. The CLI is installed globally
// (it's not a project dependency — see docs/CONTRIBUTING.md), so a fresh machine
// hits a cryptic `sh: netlify: command not found`. This turns that into an
// actionable message before `netlify dev` runs.

import { hasCommand, fail } from './lib/utils.mjs';

if (!hasCommand('netlify')) {
  fail(
    [
      '[dev:netlify] Netlify CLI not found on PATH.',
      '  Install it globally:  npm install -g netlify-cli',
    ].join('\n')
  );
}
