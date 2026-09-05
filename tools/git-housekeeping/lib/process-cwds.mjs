// Which processes have their working directory inside a path. A clean, merged
// worktree can still be the cwd of a live agent session, and removing a
// directory out from under one fails strangely later, so the prune treats a
// live cwd as "in use" rather than trusting git's clean/merged verdict alone.

import { readdirSync, readlinkSync } from 'node:fs';

import { hasCommand, tryCapture } from '../../lib/proc.mjs';

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

export function listProcessCwds() {
  if (hasCommand('lsof')) {
    // lsof exits non-zero when any process refuses inspection, which is every
    // run on a multi-user host; the partial listing is still the answer.
    const result = tryCapture('lsof', ['-w', '-d', 'cwd', '-Fpcn']);
    if (result.stdout) return parseLsofCwds(result.stdout);
  }
  if (process.platform === 'linux') return readProcCwds();
  return [];
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
