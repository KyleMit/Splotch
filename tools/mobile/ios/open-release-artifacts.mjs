// Reveals the built iOS release artifacts in the OS file manager (ADR-0017).

import { join } from 'node:path';
import { ROOT, openInOS } from '../../lib/proc.mjs';

const path = join(ROOT, 'ios', 'App', 'build', 'ipa');

openInOS(path);
