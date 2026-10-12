// Stamp web/build with the commit it was built from — the postperf:build hook.
// The mechanism and its WHY live in lib/build-provenance.mjs.
import { isMain, runMain } from '../lib/proc.mjs';
import { writeBuildProvenance } from './lib/build-provenance.mjs';

export async function runWriteBuildProvenance() {
  const provenance = writeBuildProvenance();
  if (!provenance) {
    console.warn('build provenance not recorded — git did not answer');
    return;
  }
  console.log(`build provenance: ${provenance.commit}${provenance.dirty ? ' (dirty tree)' : ''}`);
}

if (isMain(import.meta.url)) {
  runMain(runWriteBuildProvenance);
}
