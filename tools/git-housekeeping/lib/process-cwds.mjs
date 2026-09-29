// Which processes have their working directory inside a path. A clean, merged
// worktree can still be the cwd of a live agent session, and removing a
// directory out from under one fails strangely later, so the prune treats a
// live cwd as "in use" rather than trusting git's clean/merged verdict alone.

import { spawnSync } from 'node:child_process';
import { readdirSync, readlinkSync } from 'node:fs';

import { hasCommand } from '../../lib/proc.mjs';

// Room for the whole listing, so that running out of it means something went
// wrong. A busy macOS host with about six hundred processes printed 27.5 KB.
const LSOF_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

// `lsof -F` prints one field per line: `p<pid>` opens a process block, `c<cmd>`
// names it, and each file record contributes `f<fd>` then `n<name>`.
export function parseLsofCwds(text) {
  const entries = [];
  let pid = null;
  let command = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      pid = Number(value);
      command = null;
    } else if (field === 'c') {
      command = value;
    } else if (field === 'n' && pid !== null) {
      entries.push({ pid, command, cwd: value });
    }
  }
  return entries;
}

// lsof exits non-zero when any process refuses inspection, which is every run
// on a multi-user host, and that partial listing is still the answer. A spawn
// error or a signal is different: it cuts the output off at an arbitrary
// point, and a listing cut short can name this process and still miss the one
// sitting in a worktree. So those read as no listing at all.
//
// `maxBufferBytes` is a seam for tests, which cannot cheaply overflow the real
// buffer.
export function readLsofCwds({ maxBufferBytes = LSOF_MAX_BUFFER_BYTES } = {}) {
  if (!hasCommand('lsof')) return [];
  const result = spawnSync('lsof', ['-w', '-d', 'cwd', '-Fpcn'], {
    encoding: 'utf8',
    maxBuffer: maxBufferBytes,
  });
  if (result.error || result.signal) return [];
  return parseLsofCwds(result.stdout);
}

function readProcCwds() {
  const entries = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      entries.push({
        pid: Number(name),
        command: null,
        cwd: readlinkSync(`/proc/${name}/cwd`),
      });
    } catch {
      // Another user's process, or one that exited mid-scan.
    }
  }
  return entries;
}

function liveCwdReaders() {
  return process.platform === 'linux' ? [readLsofCwds, readProcCwds] : [readLsofCwds];
}

const UNUSABLE_LISTING = Object.freeze({
  ok: false,
  reason: 'no process listing names this process, so none can be trusted',
});

export const PROCESS_LISTING_NEEDS =
  'The listing needs `lsof` on PATH (macOS keeps it in /usr/sbin; Linux falls back to /proc) and a shell allowed to inspect processes.';

// A listing that worked names the process that asked for it. One that does not
// has failed, whatever else it holds: `lsof` is off PATH, or the shell may not
// inspect processes. A failed listing says nothing about which directories are
// in use, so it comes back as unusable and never as an empty answer.
//
// `readers` is a seam for tests, which cannot take `lsof` away from a real host.
export function listProcessCwds({ readers = liveCwdReaders() } = {}) {
  for (const read of readers) {
    const entries = read();
    if (entries.some(({ pid }) => pid === process.pid)) return { ok: true, entries };
  }
  return UNUSABLE_LISTING;
}

// The script's own process and the npm that launched it are always "inside"
// whatever checkout they run from, so they never count as users of it.
export function processesUsing(directory, cwds, { ignorePids = [process.pid, process.ppid] } = {}) {
  const base = directory.replace(/\/+$/, '');
  const prefix = `${base}/`;
  return cwds.filter(
    ({ pid, cwd }) => !ignorePids.includes(pid) && (cwd === base || cwd.startsWith(prefix))
  );
}
