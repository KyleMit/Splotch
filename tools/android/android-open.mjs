// Reveals the built Android release bundle folder in the OS file manager
// (ADR-0017). The location comes from tools/android/lib/android.mjs so it stays in
// step with android:bundle/android:verify.

import { openInOS } from '../lib/proc.mjs';
import { RELEASE_BUNDLE_DIR } from './lib/android.mjs';

openInOS(RELEASE_BUNDLE_DIR);
