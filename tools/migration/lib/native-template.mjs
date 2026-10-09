import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, posix, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Parser } from 'tar';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { verifyArtifactIntegrity } from './archive-inventory.mjs';
import {
  assertRequiredTemplateMembers,
  candidateTemplateTarget,
  requiresTemplateOriginalText,
  templateTransformationName,
  transformTemplateMember,
} from './native-template-transforms.mjs';

const SHA256 = /^[a-f\d]{64}$/;
const MEMBER_KEYS = ['bytes', 'mode', 'path', 'sha256', 'type'];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    throw new Error(`Invalid ${label} shape`);
  }
}

export function assertTemplateMemberPath(path) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('package/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path !== posix.normalize(path) ||
    path.endsWith('/') ||
    path.split('/').some((part) => !part || part === '..' || part === '.')
  ) {
    throw new Error(`Unsafe template member: ${path}`);
  }
}

function verifiedTemplateOriginal(member) {
  if (typeof member.originalText !== 'string')
    throw new Error(`Invalid template original text: ${member.path}`);
  const bytes = Buffer.from(member.originalText, 'utf8');
  if (
    bytes.toString('utf8') !== member.originalText ||
    bytes.length !== member.bytes ||
    sha256(bytes) !== member.sha256
  )
    throw new Error(`Template original text changed: ${member.path}`);
  return bytes;
}

export function assertTemplateManifest(manifest, alignment) {
  exactKeys(
    manifest,
    ['schemaVersion', 'template', 'registryMetadata', 'archive', 'members'],
    'template manifest'
  );
  exactKeys(manifest.template, ['name', 'version', 'integrity'], 'template identity');
  exactKeys(manifest.registryMetadata, ['url', 'sha256'], 'template metadata');
  exactKeys(manifest.archive, ['url', 'bytes', 'sha256'], 'template archive');
  if (
    manifest.schemaVersion !== 1 ||
    JSON.stringify(manifest.template) !== JSON.stringify(alignment.template)
  ) {
    throw new Error('Template differs from reviewed SDK alignment');
  }
  const { name, version } = manifest.template;
  if (
    manifest.registryMetadata.url !== `https://registry.npmjs.org/${name}/${version}` ||
    manifest.archive.url !== `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`
  ) {
    throw new Error('Template registry source changed');
  }
  if (
    !Number.isSafeInteger(manifest.archive.bytes) ||
    manifest.archive.bytes <= 0 ||
    !SHA256.test(manifest.archive.sha256) ||
    !SHA256.test(manifest.registryMetadata.sha256)
  ) {
    throw new Error('Invalid template archive provenance');
  }
  if (!Array.isArray(manifest.members) || !manifest.members.length)
    throw new Error('Template members are absent');
  const paths = new Set();
  for (const member of manifest.members) {
    assertTemplateMemberPath(member?.path);
    const requiresText = requiresTemplateOriginalText(member.path);
    exactKeys(
      member,
      [...MEMBER_KEYS, ...(requiresText ? ['originalText'] : [])],
      'template member'
    );
    if (
      paths.has(member.path) ||
      member.type !== 'file' ||
      !['0o644', '0o755'].includes(member.mode) ||
      !Number.isSafeInteger(member.bytes) ||
      member.bytes < 0 ||
      !SHA256.test(member.sha256)
    ) {
      throw new Error(`Invalid template member: ${member.path}`);
    }
    if (requiresText) verifiedTemplateOriginal(member);
    paths.add(member.path);
  }
  if (!paths.has('package/package.json')) throw new Error('Template package identity is absent');
  assertRequiredTemplateMembers(paths);
}

export function readTemplateManifest(root) {
  const manifest = JSON.parse(
    readOwnedInput(root, 'tools/migration/inputs/native-template-manifest.json')
  );
  const alignment = JSON.parse(readOwnedInput(root, `${CANDIDATE_DIRECTORY}/alignment.json`));
  assertTemplateManifest(manifest, alignment);
  const metadataBytes = readOwnedInput(
    root,
    `tools/migration/inputs/${manifest.template.name}-${manifest.template.version}.metadata.json.txt`
  );
  if (sha256(metadataBytes) !== manifest.registryMetadata.sha256)
    throw new Error('Reviewed registry metadata bytes changed');
  const metadata = JSON.parse(metadataBytes);
  if (
    metadata.name !== manifest.template.name ||
    metadata.version !== manifest.template.version ||
    metadata.dist?.integrity !== manifest.template.integrity ||
    metadata.dist?.tarball !== manifest.archive.url
  )
    throw new Error('Reviewed registry metadata identity changed');
  if (
    metadata.dist.fileCount !== manifest.members.length ||
    metadata.dist.unpackedSize !== manifest.members.reduce((sum, member) => sum + member.bytes, 0)
  )
    throw new Error('Reviewed registry metadata member totals changed');
  return manifest;
}

function readOwnedInput(root, path) {
  const file = join(root, path);
  const stat = lstatSync(file);
  const canonical = realpathSync(file);
  const remainder = relative(realpathSync(root), canonical);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    canonical !== join(realpathSync(root), path) ||
    !remainder ||
    remainder === '..' ||
    remainder.startsWith(`..${sep}`) ||
    isAbsolute(remainder)
  )
    throw new Error(`Unowned native source input: ${path}`);
  return readFileSync(canonical);
}

function inspectEntry(entry, expected, seen, parser, files) {
  try {
    assertTemplateMemberPath(entry.path);
    const member = expected.get(entry.path);
    if (
      !member ||
      seen.has(entry.path) ||
      entry.type !== 'File' ||
      entry.linkpath ||
      entry.size !== member.bytes ||
      (entry.mode & 0o777) !== Number(member.mode)
    ) {
      throw new Error(`Unexpected template archive member: ${entry.path}`);
    }
    seen.add(entry.path);
    const chunks = [];
    entry.on('data', (chunk) => chunks.push(chunk));
    entry.on('end', () => {
      const bytes = Buffer.concat(chunks);
      if (sha256(bytes) !== member.sha256)
        parser.abort(new Error(`Template member digest changed: ${entry.path}`));
      else {
        try {
          assertTemplateOriginalBytes(member, bytes);
          files.set(entry.path, bytes);
        } catch (error) {
          parser.abort(error);
        }
      }
    });
  } catch (error) {
    parser.abort(error);
  }
}

export async function readTemplateArchive(bytes, manifest) {
  verifyArtifactIntegrity(bytes, manifest.template.integrity);
  if (bytes.length !== manifest.archive.bytes || sha256(bytes) !== manifest.archive.sha256)
    throw new Error('Template archive provenance changed');
  const expected = new Map(manifest.members.map((member) => [member.path, member]));
  const seen = new Set();
  const files = new Map();
  const parser = new Parser({
    onReadEntry(entry) {
      inspectEntry(entry, expected, seen, parser, files);
    },
  });
  const finished = once(parser, 'end');
  parser.end(bytes);
  await finished;
  if (seen.size !== expected.size || files.size !== expected.size)
    throw new Error('Template archive is missing reviewed members');
  const packageJson = JSON.parse(files.get('package/package.json').toString('utf8'));
  if (
    packageJson.name !== manifest.template.name ||
    packageJson.version !== manifest.template.version
  )
    throw new Error('Template archive package identity changed');
  return files;
}

function assertTemplateOriginalBytes(member, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== member.bytes || sha256(bytes) !== member.sha256)
    throw new Error(`Unverified template source: ${member.path}`);
  if (requiresTemplateOriginalText(member.path) && !verifiedTemplateOriginal(member).equals(bytes))
    throw new Error(`Template archive original text changed: ${member.path}`);
}

export function expectedNativeProvenance(manifest) {
  const targets = new Set();
  const records = manifest.members.map((member) => {
    const target = candidateTemplateTarget(member.path);
    if (!target)
      return { source: member.path, sourceSha256: member.sha256, target: null, change: 'omitted' };
    if (targets.has(target)) throw new Error(`Duplicate template target: ${target}`);
    targets.add(target);
    const change = templateTransformationName(member.path);
    const targetSha256 =
      change === 'unchanged'
        ? member.sha256
        : sha256(transformTemplateMember(member.path, verifiedTemplateOriginal(member)).bytes);
    return {
      source: member.path,
      sourceSha256: member.sha256,
      target,
      change,
      targetSha256,
      mode: member.mode,
    };
  });
  return {
    schemaVersion: 1,
    template: manifest.template,
    archive: manifest.archive,
    records,
  };
}

export function deriveNativeSources(manifest, members) {
  const provenance = expectedNativeProvenance(manifest);
  const files = new Map();
  for (const [index, member] of manifest.members.entries()) {
    const original = members.get(member.path);
    assertTemplateOriginalBytes(member, original);
    const record = provenance.records[index];
    if (!record.target) continue;
    const transformed = transformTemplateMember(member.path, original);
    if (sha256(transformed.bytes) !== record.targetSha256)
      throw new Error(`Template transformation replay changed: ${member.path}`);
    files.set(record.target, { bytes: transformed.bytes, mode: Number(member.mode) });
  }
  return { files, provenance };
}

export function assertNativeProvenance(provenance, manifest) {
  if (!isDeepStrictEqual(provenance, expectedNativeProvenance(manifest)))
    throw new Error('Native provenance replay mismatch');
  return provenance.records.filter((record) => record.target);
}
