import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export const NATIVE_GEMFILE_OWNER = Object.freeze({
  path: 'Gemfile',
  ownership: 'maintained-manual-source',
  upstream: 'https://raw.githubusercontent.com/facebook/react-native/v0.86.3/Gemfile',
  sourceSha256: 'c3148d004533ff2007b1f0173376b78ee7a00d0b7ee231c7932a0734f3e469f8',
  ruby: '3.4.11',
  cocoapods: '1.16.2',
  xcodeproj: '1.27.0',
});

export const NATIVE_GEMFILE_LOCK_OWNER = Object.freeze({
  path: 'Gemfile.lock',
  ownership: 'maintained-lock-source',
  sourceSha256: '8e949a48a8633cf9a785249a0e87df74d351db720f182e5980121eccc858a971',
});

function readCandidateGemfileLock(candidate) {
  const path = join(candidate, NATIVE_GEMFILE_LOCK_OWNER.path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(path) !== path)
    throw new Error('Native Gemfile.lock is not an owned regular source');
  const sourceSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (sourceSha256 !== NATIVE_GEMFILE_LOCK_OWNER.sourceSha256)
    throw new Error('Native Gemfile.lock source changed');
  return { ...NATIVE_GEMFILE_LOCK_OWNER, sourceSha256 };
}

export function readCandidateGemfile(candidate) {
  const path = join(candidate, NATIVE_GEMFILE_OWNER.path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path)
    throw new Error('Manual native Gemfile is not an owned regular source');
  const sourceSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (sourceSha256 !== NATIVE_GEMFILE_OWNER.sourceSha256)
    throw new Error('Manual native Gemfile source changed');
  return {
    ...NATIVE_GEMFILE_OWNER,
    sourceSha256,
    lockfile: readCandidateGemfileLock(candidate),
    resolvedGemGraphQualified: false,
  };
}
