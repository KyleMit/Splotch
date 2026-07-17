// Reveals a path in the OS file manager: `open` on macOS and `xdg-open` on Linux. The path argument is resolved
// relative to the repo root. Used by android:open to show the release bundle
// folder after a build.

import { join } from 'node:path';
import { ROOT, run, fail } from './lib/utils.mjs';

const target = process.argv[2];
if (!target)
  fail(
    '[open-path] no path given — e.g. node scripts/open-path.mjs android/app/build/outputs/bundle/release'
  );

const path = join(ROOT, target);

run(process.platform === 'darwin' ? 'open' : 'xdg-open', [path]);
