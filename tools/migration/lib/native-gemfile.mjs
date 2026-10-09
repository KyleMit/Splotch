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

export function readCandidateGemfile(candidate) {
  const path = join(candidate, NATIVE_GEMFILE_OWNER.path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path)
    throw new Error('Manual native Gemfile is not an owned regular source');
  const sourceSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (sourceSha256 !== NATIVE_GEMFILE_OWNER.sourceSha256)
    throw new Error('Manual native Gemfile source changed');
  return { ...NATIVE_GEMFILE_OWNER, sourceSha256, resolvedGemGraphQualified: false };
}
