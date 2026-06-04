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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AAB = join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

const javaHome = process.env.JAVA_HOME;
if (!javaHome) {
  console.error('[android-verify] JAVA_HOME is not set — cannot locate jarsigner.');
  process.exit(1);
}

const exe = process.platform === 'win32' ? 'jarsigner.exe' : 'jarsigner';
const jarsigner = join(javaHome, 'bin', exe);

const { stdout = '', stderr = '', status, error } = spawnSync(jarsigner, ['-verify', AAB], {
  encoding: 'utf8',
});

if (error) {
  console.error(`[android-verify] failed to run jarsigner: ${error.message}`);
  process.exit(1);
}

const output = stdout + stderr;
const verified = /^jar verified\.$/m.test(output);

if (verified && status === 0) {
  console.log('jar verified.');
  process.exit(0);
}

// Something is actually wrong — show everything so it can be diagnosed.
console.error('[android-verify] bundle did NOT verify. Full jarsigner output:\n');
console.error(output.trim());
process.exit(status || 1);
