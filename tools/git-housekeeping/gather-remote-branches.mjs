#!/usr/bin/env node
// Gather the git-derivable facts for every remote branch so the
// prune-git-workspace skill can triage 100+ of them without one git call per
// branch. Prints an aligned table (oldest first) or `--json`. It deletes
// nothing and looks up no PR state — that is the agent's job on top of this.
//
// Usage:
//   node tools/git-housekeeping/gather-remote-branches.mjs [--json] [--no-fetch] [--base=main]
//
// Columns:
//   ahead   commits on the branch that are NOT on the base (unique work)
//   behind  commits on the base that the branch is missing (how stale)
//   inbase  "yes" when every commit already has an equivalent on the base
//           (patch-id match — catches ordinary and rebase merges; a squash
//           merge shows inbase=no and still needs a PR-status check)
//   age     days since the branch tip was last committed to
//   date    tip commit date (ISO, local)

import { parseArgs } from 'node:util';

import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import { currentBranchOf, fetchBase, isPatchEquivalent, listBranchRefs } from './lib/git-facts.mjs';

const SECONDS_PER_DAY = 86400;
const MAX_NAME_WIDTH = 48;

export function parseGatherArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      json: { type: 'boolean', default: false },
      'no-fetch': { type: 'boolean', default: false },
      base: { type: 'string', default: 'main' },
      remote: { type: 'string', default: 'origin' },
    },
  });
  return {
    json: values.json,
    fetch: !values['no-fetch'],
    base: values.base,
    remote: values.remote,
  };
}

export function gatherRemoteBranches({ cwd, base, remote, now = Date.now() }) {
  const baseRef = `${remote}/${base}`;
  const currentBranch = currentBranchOf(cwd);
  const nowSeconds = Math.floor(now / 1000);
  return listBranchRefs(cwd, { base: baseRef, namespace: `refs/remotes/${remote}` })
    .map((ref) => ({ ...ref, branch: ref.name.replace(`${remote}/`, '') }))
    .filter((ref) => ref.branch !== 'HEAD' && ref.branch !== base)
    .map((ref) => ({
      branch: ref.branch,
      ahead: ref.ahead,
      behind: ref.behind,
      inbase: ref.ahead === 0 || isPatchEquivalent(baseRef, ref.name, cwd),
      ageDays: Math.floor((nowSeconds - ref.committedAt) / SECONDS_PER_DAY),
      date: ref.date,
      author: ref.author,
      subject: ref.subject,
      isCurrent: ref.branch === currentBranch,
    }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

export function formatRemoteBranchTable(rows, { base }) {
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  const nameW = Math.min(MAX_NAME_WIDTH, Math.max(6, ...rows.map((r) => r.branch.length)));
  const lines = [
    `${pad('branch', nameW)}  ${padL('ahead', 5)} ${padL('behind', 6)}  ${pad('inbase', 6)}  ${padL('age', 4)}  ${pad('date', 10)}  subject`,
  ];
  for (const r of rows) {
    const mark = r.isCurrent ? ' *' : '  ';
    lines.push(
      `${pad(r.branch, nameW)}${mark}${padL(r.ahead, 3)} ${padL(r.behind, 6)}  ${pad(r.inbase ? 'yes' : 'no', 6)}  ${padL(`${r.ageDays}d`, 4)}  ${pad(r.date, 10)}  ${r.subject}`
    );
  }
  lines.push('');
  lines.push(
    `${rows.length} branches (base=${base}). "*" = current checkout. inbase=yes or ahead=0 are easy kills.`
  );
  return lines.join('\n');
}

export async function runGatherRemoteBranches(options, { cwd = ROOT } = {}) {
  const { json, fetch, base, remote } = options;
  if (fetch) {
    process.stderr.write(`Fetching ${remote} with --prune…\n`);
    const fetched = fetchBase(cwd, { remote });
    if (!fetched.ok) {
      process.stderr.write(
        `fetch failed (${fetched.stderr.split('\n')[0]}); using the last-known refs\n`
      );
    }
  }
  const rows = gatherRemoteBranches({ cwd, base, remote });
  process.stdout.write(
    json ? `${JSON.stringify(rows, null, 2)}\n` : `${formatRemoteBranchTable(rows, { base })}\n`
  );
  return rows;
}

if (isMain(import.meta.url)) {
  runMain(() => runGatherRemoteBranches(parseOrFail(() => parseGatherArgs(process.argv.slice(2)))));
}
