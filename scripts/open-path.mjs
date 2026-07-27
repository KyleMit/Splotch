// Reveals a path in the OS file manager (ADR-0017): `open` on macOS,
// `xdg-open` on Linux. The path argument is resolved relative to the repo root.
// Used by ios:open to show the built IPA folder.

import { join } from 'node:path';
import { ROOT, run, fail } from './lib/utils.mjs';

const target = process.argv[2];
if (!target) fail('[open-path] no path given — e.g. node scripts/open-path.mjs ios/App/build/ipa');

const path = join(ROOT, target);

run(process.platform === 'darwin' ? 'open' : 'xdg-open', [path]);
