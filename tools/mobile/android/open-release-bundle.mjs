// Reveals the built Android release bundle folder in the OS file manager
// (ADR-0017). The location comes from tools/mobile/android/lib/android-toolchain.mjs so it stays
// in step with android:bundle/android:verify.

import { isMain, openInOS } from '../../lib/proc.mjs';
import { RELEASE_BUNDLE_DIR } from './lib/android-toolchain.mjs';

export function openReleaseBundle() {
  openInOS(RELEASE_BUNDLE_DIR);
}

if (isMain(import.meta.url)) openReleaseBundle();
