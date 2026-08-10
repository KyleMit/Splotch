// Reveals a path in the OS file manager (ADR-0017). The path argument is
// resolved relative to the repo root. Used by ios:open to show the built IPA
// folder.

import { join } from 'node:path';
import { ROOT, openInOS, fail } from './lib/proc.mjs';

const target = process.argv[2];
if (!target) fail('[open-path] no path given — e.g. node tools/open-path.mjs ios/App/build/ipa');

const path = join(ROOT, target);

openInOS(path);
