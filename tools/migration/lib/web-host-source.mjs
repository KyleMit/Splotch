import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathInside } from './web-host-ownership.mjs';
import { qualifyJointNativeInputs } from './native-joint-graph.mjs';

const GIT_OUTPUT_MAX_BYTES = 32 * 1024 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_EXCLUSIONS = ['perf-profiles/', 'artifacts/'];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sourceGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_MAX_BYTES,
  });
}

function safeSourcePath(path) {
  if (!path || isAbsolute(path) || path.split('/').includes('..') || path.includes('\\')) {
    throw new Error(`Unsafe source path: ${path}`);
  }
  return path;
}

function exclusion(path) {
  if (SOURCE_EXCLUSIONS.some((prefix) => path.startsWith(prefix))) return 'capture/output corpus';
  if (path.split('/').some((part) => /^\.env(?:\.|$)/.test(part) && !part.endsWith('.example'))) {
    return 'dotenv excluded from build inputs';
  }
  return undefined;
}

function sourceEntry(root, path) {
  safeSourcePath(path);
  const absolute = join(root, path);
  const stat = lstatSync(absolute);
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(readlinkSync(absolute))
    : readFileSync(absolute);
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Unsupported source file: ${path}`);
  if (
    stat.isSymbolicLink() &&
    (isAbsolute(bytes.toString()) || !pathInside(root, realpathSync(absolute)))
  ) {
    throw new Error(`Source link escapes the checkout: ${path}`);
  }
  return {
    path,
    sha256: sha256(bytes),
    executable: !!(stat.mode & 0o111),
    link: stat.isSymbolicLink() ? bytes.toString() : null,
  };
}

function committedEntries(root, sha) {
  return sourceGit(root, ['ls-tree', '-r', '-z', sha])
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const [header, path] = row.split('\t');
      const [mode, type, blob] = header.split(' ');
      if (type !== 'blob') throw new Error(`Submodule or unsupported source entry: ${path}`);
      return { mode, blob, path: safeSourcePath(path) };
    });
}

function verifyGitBlob(root, entry) {
  const path = join(root, entry.path);
  const bytes = entry.mode === '120000' ? Buffer.from(readlinkSync(path)) : readFileSync(path);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== entry.blob) throw new Error(`Source differs from committed blob: ${entry.path}`);
  const executable = !!(lstatSync(path).mode & 0o111);
  if (entry.mode !== '120000' && executable !== (entry.mode === '100755')) {
    throw new Error(`Source executable mode differs from Git: ${entry.path}`);
  }
}

export function freezeSource({ root, topologySha, topologyLockSha256, provisional }) {
  if (!SHA_PATTERN.test(topologySha ?? ''))
    throw new Error('Actual reviewed topology SHA is required (40 lowercase hex characters)');
  if (!SHA256_PATTERN.test(topologyLockSha256 ?? ''))
    throw new Error('Actual reviewed topology lock SHA256 is required');
  const sha = sourceGit(root, ['rev-parse', '--verify', 'HEAD']).trim();
  if (!SHA_PATTERN.test(sha)) throw new Error(`Unsupported source commit format: ${sha}`);
  sourceGit(root, ['merge-base', '--is-ancestor', topologySha, sha]);
  const topologyLock = execFileSync('git', ['-C', root, 'show', `${topologySha}:pnpm-lock.yaml`]);
  if (sha256(topologyLock) !== topologyLockSha256)
    throw new Error('Reviewed topology commit/lock digest mismatch');
  const lockSha256 = sha256(readFileSync(join(root, 'pnpm-lock.yaml')));
  let nativeQualification = null;
  if (lockSha256 !== topologyLockSha256) {
    try {
      const joint = qualifyJointNativeInputs(root);
      if (joint.audio.baselineLockSha256 !== topologyLockSha256)
        throw new Error('Joint native baseline differs from the reviewed topology lock');
      if (
        joint.qualification.actualLockSha256 !== lockSha256 ||
        joint.audio.lockSha256 !== lockSha256 ||
        joint.qualification.actualWorkspaceSha256 !==
          sha256(readFileSync(join(root, 'pnpm-workspace.yaml')))
      )
        throw new Error('Joint native qualification differs from the actual source inputs');
      nativeQualification = joint;
    } catch (cause) {
      throw new Error(
        'Current lock differs from the reviewed topology lock; joint native qualification failed',
        { cause }
      );
    }
  }
  const status = sourceGit(root, ['status', '--porcelain=v1', '-z']);
  if (status && !provisional)
    throw new Error(
      'Committed source mode requires a clean checkout; use --provisional for an explicitly unreviewed trial'
    );
  const committed = committedEntries(root, sha);
  const paths = provisional
    ? sourceGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(Boolean)
    : committed.map((entry) => entry.path);
  const excluded = paths.filter(exclusion).map((path) => ({ path, reason: exclusion(path) }));
  const entries = [...new Set(paths.filter((path) => !exclusion(path)))]
    .sort()
    .map((path) => sourceEntry(root, path));
  if (!provisional)
    committed
      .filter((entry) => !exclusion(entry.path))
      .forEach((entry) => verifyGitBlob(root, entry));
  const kept = new Set(entries.map((entry) => entry.path));
  for (const entry of entries.filter((entry) => entry.link)) {
    const target = resolve(dirname(join(root, entry.path)), entry.link);
    if (!kept.has(target.slice(root.length + 1)))
      throw new Error(`Source link targets an excluded/untracked input: ${entry.path}`);
  }
  return {
    root,
    sha,
    topologySha,
    topologyLockSha256,
    lockSha256,
    nativeQualification,
    provisional,
    statusSha256: sha256(status),
    patchSha256: provisional
      ? sha256(execFileSync('git', ['-C', root, 'diff', '--binary', 'HEAD']))
      : null,
    entries,
    excluded,
  };
}

export function copySource(snapshot, destination) {
  mkdirSync(destination, { recursive: false });
  const entries = [
    ...snapshot.entries.filter((entry) => !entry.link),
    ...snapshot.entries.filter((entry) => entry.link),
  ];
  for (const entry of entries) {
    const source = join(snapshot.root, entry.path);
    const target = join(destination, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.link) symlinkSync(entry.link, target);
    else {
      copyFileSync(source, target, constants.COPYFILE_FICLONE);
      chmodSync(target, entry.executable ? 0o755 : 0o644);
      const before = lstatSync(source);
      const after = lstatSync(target);
      if ((before.dev === after.dev && before.ino === after.ino) || after.nlink !== 1) {
        throw new Error(`Source copy aliases a borrowed inode: ${entry.path}`);
      }
    }
  }
  for (const entry of snapshot.entries) {
    if (sourceEntry(destination, entry.path).sha256 !== entry.sha256) {
      throw new Error(`Source changed during export: ${entry.path}`);
    }
  }
}

export function assertSourceUnchanged(snapshot) {
  if (
    sourceGit(snapshot.root, ['rev-parse', 'HEAD']).trim() !== snapshot.sha ||
    sha256(sourceGit(snapshot.root, ['status', '--porcelain=v1', '-z'])) !== snapshot.statusSha256
  ) {
    throw new Error(
      'Active source checkout changed while building; artifacts are not review evidence'
    );
  }
  for (const entry of snapshot.entries) {
    if (sourceEntry(snapshot.root, entry.path).sha256 !== entry.sha256) {
      throw new Error(`Active source input changed while building: ${entry.path}`);
    }
  }
}
