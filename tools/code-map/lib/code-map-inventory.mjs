import { execFileSync } from 'node:child_process';

import { ROOT } from '../../lib/proc.mjs';

// Every blob is read out of one commit rather than the working tree, so a map
// regenerated at the same ref is byte-identical whatever the checkout holds.
const GIT_MAX_BUFFER_BYTES = 1024 * 1024 * 1024;
const NEWLINE = 0x0a;

const git = (args, input) =>
  execFileSync('git', args, { cwd: ROOT, input, maxBuffer: GIT_MAX_BUFFER_BYTES });

export function resolveCommit(ref) {
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`])
    .toString()
    .trim();
  const date = git(['show', '-s', '--format=%cs', sha]).toString().trim();
  return { sha, date };
}

// Gitlinks (submodules) carry no content and are left out; symlinks are blobs
// holding their target path and are listed like any other file.
export function listTrackedBlobs(sha) {
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', sha]).toString().split('\0');
  const blobs = [];
  for (const entry of entries) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    const [, type, oid] = entry.slice(0, tab).split(' ');
    if (type === 'blob') blobs.push({ path: entry.slice(tab + 1), oid });
  }
  return blobs;
}

function countNewlines(buffer, start, end) {
  let count = 0;
  for (let index = start; index < end; index += 1) if (buffer[index] === NEWLINE) count += 1;
  return count;
}

// `wc -l` semantics: a final line without a trailing newline is not counted.
export function countLinesByOid(oids) {
  const unique = [...new Set(oids)];
  const lines = new Map();
  if (unique.length === 0) return lines;
  const output = git(['cat-file', '--batch'], `${unique.join('\n')}\n`);
  let offset = 0;
  for (const requested of unique) {
    const { contentStart, contentEnd } = readBatchEntry(output, offset, requested);
    lines.set(requested, countNewlines(output, contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) throw new Error('git cat-file --batch returned unexpected output');
  return lines;
}

// One `<oid> blob <size>\n<content>\n` entry. A `<oid> missing` reply, a
// non-blob, or a short read fails the run: a silently skipped blob would
// undercount the map without any sign.
function readBatchEntry(output, offset, requested) {
  const headerEnd = output.indexOf(NEWLINE, offset);
  if (headerEnd === -1) throw new Error(`git cat-file --batch ended before ${requested}`);
  const header = output.subarray(offset, headerEnd).toString();
  const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
  if (!match || match[1] !== requested) {
    throw new Error(`git cat-file --batch: expected blob ${requested}, got "${header}"`);
  }
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + Number(match[2]);
  if (contentEnd >= output.length || output[contentEnd] !== NEWLINE) {
    throw new Error(`git cat-file --batch: truncated content for ${requested}`);
  }
  return { contentStart, contentEnd };
}
