import {
  closeSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { assertNativeSourceContract } from './lib/native-source-contract.mjs';
import {
  assertContainedNativePath,
  readNativeCandidateRoot,
  readCandidateEntry,
  readMaintainedNativeFiles,
} from './lib/native-source-files.mjs';
import {
  deriveNativeSources,
  readTemplateArchive,
  readTemplateManifest,
} from './lib/native-template.mjs';

function parseArchiveFlag(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { archive: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  if (
    !values.archive?.trim() ||
    argv.filter((arg) => arg === '--archive' || arg.startsWith('--archive=')).length !== 1
  )
    throw new Error('Specify one --archive=<reviewed-template.tgz>');
  return resolve(values.archive);
}

function ownedDestination(candidate, files) {
  const targets = ['android', 'ios', 'TEMPLATE-LICENSE', 'native-template-provenance.json'];
  const existing = targets.filter((target) => {
    try {
      lstatSync(join(candidate, target));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
  if (!existing.length) return false;
  if (existing.length !== targets.length)
    throw new Error('Existing native destination is incomplete or unowned');
  const maintained = readMaintainedNativeFiles(candidate, readTemplateManifest(realpathSync(ROOT)));
  if (
    maintained.size !== files.size ||
    [...files].some(([path, file]) => !maintained.get(path)?.equals(file.bytes))
  )
    throw new Error('Materialization would overwrite maintained native edits');
  assertMaterializedModes(candidate, files);
  return true;
}

function assertMaterializedModes(candidate, files) {
  for (const [path, file] of files) {
    if ((lstatSync(join(candidate, path)).mode & 0o777) !== file.mode)
      throw new Error(`Materialized native mode changed: ${path}`);
  }
}

function writeMaintainedSource(path, file) {
  const descriptor = openSync(path, 'wx', file.mode);
  try {
    writeFileSync(descriptor, file.bytes);
    fchmodSync(descriptor, file.mode);
  } finally {
    closeSync(descriptor);
  }
}

export async function runNativeCandidateMaterialization(argv) {
  const archive = parseArchiveFlag(argv);
  if (lstatSync(archive).isSymbolicLink() || !lstatSync(archive).isFile())
    throw new Error('Template archive must be an explicit regular file');
  const root = realpathSync(ROOT);
  const candidate = readNativeCandidateRoot(root);
  const manifest = readTemplateManifest(root);
  if (lstatSync(archive).size !== manifest.archive.bytes)
    throw new Error('Template archive size changed');
  const members = await readTemplateArchive(readFileSync(archive), manifest);
  const { files, provenance } = deriveNativeSources(manifest, members);
  const { packageManifest, indexSource } = readCandidateEntry(candidate);
  assertNativeSourceContract(
    new Map([...files].map(([path, file]) => [path, file.bytes])),
    packageManifest,
    indexSource
  );
  const unchanged = ownedDestination(candidate, files);
  if (!unchanged) {
    for (const [path, file] of files) {
      const target = join(candidate, path);
      mkdirSync(dirname(target), { recursive: true });
      if (dirname(target) !== candidate) assertContainedNativePath(candidate, dirname(target));
      writeMaintainedSource(target, file);
    }
    writeFileSync(
      join(candidate, 'native-template-provenance.json'),
      JSON.stringify(provenance, null, 2) + '\n',
      { flag: 'wx' }
    );
    assertMaterializedModes(candidate, files);
  }
  return {
    candidate,
    template: manifest.template,
    copiedFiles: files.size,
    unchanged,
    nativeExecution: false,
  };
}

if (isMain(import.meta.url)) {
  runMain(async () =>
    console.log(JSON.stringify(await runNativeCandidateMaterialization(process.argv.slice(2))))
  );
}
