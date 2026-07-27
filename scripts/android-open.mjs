// Reveals the built Android release bundle folder in the OS file manager
// (ADR-0017): `open` on macOS, `xdg-open` on Linux. The location comes from
// scripts/lib/android.mjs so it stays in step with android:bundle/android:verify.

import { run } from './lib/utils.mjs';
import { RELEASE_BUNDLE_DIR } from './lib/android.mjs';

run(process.platform === 'darwin' ? 'open' : 'xdg-open', [RELEASE_BUNDLE_DIR]);
