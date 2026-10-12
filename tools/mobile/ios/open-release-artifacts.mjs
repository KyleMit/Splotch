// Reveals the built iOS release artifacts in the OS file manager (ADR-0017).

import { join } from 'node:path';
import { ROOT, isMain, openInOS } from '../../lib/proc.mjs';

export const RELEASE_IPA_DIR = join(ROOT, 'ios', 'App', 'build', 'ipa');
export const RELEASE_IPA = join(RELEASE_IPA_DIR, 'App.ipa');

export function openReleaseArtifacts() {
  openInOS(RELEASE_IPA_DIR);
}

if (isMain(import.meta.url)) openReleaseArtifacts();
