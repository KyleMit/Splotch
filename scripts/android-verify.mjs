// Verifies the signed release bundle and prints only the result.
//
// `jarsigner -verify` has no quiet mode: on success it prints `jar verified.`
// but buries it under a wall of warnings that are NORMAL for an upload keystore
// (self-signed cert, "PKIX path building failed" cert chain, missing timestamp,
// JarFile/JarInputStream inconsistencies). Google Play re-signs on upload, so
// those warnings are expected and not a failure.
//
// This wrapper runs jarsigner, treats the literal `jar verified.` line as the
// only success signal, and stays quiet on success. On failure it dumps the full
// jarsigner output so the real problem is visible. Used by `npm run android:verify`.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, isWindows, fail } from './lib/utils.mjs';

const AAB = join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

if (!process.env.JAVA_HOME) fail('[android-verify] JAVA_HOME is not set — cannot locate jarsigner.');
const jarsigner = join(process.env.JAVA_HOME, 'bin', isWindows ? 'jarsigner.exe' : 'jarsigner');

const { stdout = '', stderr = '', status, error } = spawnSync(jarsigner, ['-verify', AAB], { encoding: 'utf8' });
if (error) fail(`[android-verify] failed to run jarsigner: ${error.message}`);

const output = stdout + stderr;
if (status === 0 && /^jar verified\.$/m.test(output)) {
  console.log('jar verified.');
} else {
  console.error('[android-verify] bundle did NOT verify. Full jarsigner output:\n');
  console.error(output.trim());
  process.exit(status || 1);
}
