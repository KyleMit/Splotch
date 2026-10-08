import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { NATIVE_CONTRACT } from './native-source-contract.mjs';
import { assertNativeProvenance, sha256 } from './native-template.mjs';

export function assertContainedNativePath(root, path) {
  const canonical = realpathSync(path);
  const remainder = relative(realpathSync(root), canonical);
  if (!remainder || remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder))
    throw new Error(`Native path escapes owner: ${path}`);
  return canonical;
}

export function readNativeCandidateRoot(root) {
  const candidate = join(realpathSync(root), CANDIDATE_DIRECTORY);
  const canonical = assertContainedNativePath(root, candidate);
  if (lstatSync(candidate).isSymbolicLink() || canonical !== candidate)
    throw new Error('Candidate root is a symlink or alias');
  return canonical;
}

function collectNativeFiles(candidate, directory, files, targets) {
  const path = join(candidate, directory);
  assertContainedNativePath(candidate, path);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Native source symlink: ${directory}`);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Native source symlink: ${child}`);
    if (!targets.some((target) => target === child || target.startsWith(`${child}/`)))
      throw new Error(
        `Unexpected native source path: ${child}; native tools require a disposable copy`
      );
    if (entry.isDirectory()) collectNativeFiles(candidate, child, files, targets);
    else if (entry.isFile())
      files.set(child, readFileSync(assertContainedNativePath(candidate, join(candidate, child))));
    else throw new Error(`Unexpected native source type: ${child}`);
  }
}

export function readMaintainedNativeFiles(candidate, manifest) {
  const provenancePath = join(candidate, 'native-template-provenance.json');
  if (lstatSync(provenancePath).isSymbolicLink()) throw new Error('Native provenance is a symlink');
  const provenance = JSON.parse(
    readFileSync(assertContainedNativePath(candidate, provenancePath), 'utf8')
  );
  const records = assertNativeProvenance(provenance, manifest);
  const files = new Map();
  const targets = records.map((record) => record.target);
  for (const directory of ['android', 'ios'])
    collectNativeFiles(candidate, directory, files, targets);
  const license = join(candidate, 'TEMPLATE-LICENSE');
  if (lstatSync(license).isSymbolicLink()) throw new Error('Native license is a symlink');
  files.set('TEMPLATE-LICENSE', readFileSync(assertContainedNativePath(candidate, license)));
  if (files.size !== records.length || records.some((record) => !files.has(record.target)))
    throw new Error('Maintained native file set changed');
  for (const record of records) {
    const path = join(candidate, record.target);
    if (
      sha256(files.get(record.target)) !== record.targetSha256 ||
      (lstatSync(path).mode & 0o100) !== (Number(record.mode) & 0o100)
    )
      throw new Error(`Maintained native source changed: ${record.target}`);
  }
  return files;
}

export function readCandidateEntry(candidate) {
  const entry = join(candidate, NATIVE_CONTRACT.entry);
  if (lstatSync(entry).isSymbolicLink() || realpathSync(entry) !== entry)
    throw new Error('Candidate entry is a symlink or alias');
  const manifestPath = join(candidate, 'package.json');
  if (lstatSync(manifestPath).isSymbolicLink()) throw new Error('Candidate manifest is a symlink');
  return {
    packageManifest: JSON.parse(
      readFileSync(assertContainedNativePath(candidate, manifestPath), 'utf8')
    ),
    indexSource: readFileSync(assertContainedNativePath(candidate, entry), 'utf8'),
  };
}
