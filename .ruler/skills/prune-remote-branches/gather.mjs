#!/usr/bin/env node
// Gather the git-derivable facts for every remote branch, so the
// prune-remote-branches skill can triage 100+ branches without one git
// call per branch. Prints an aligned table (oldest-first) by default, or a
// JSON array with `--json`. It does NOT delete anything and does NOT look up
// PR status — that's the agent's job on top of this data.
//
// Usage:
//   node .claude/skills/prune-remote-branches/gather.mjs [--json] [--no-fetch] [--base <branch>]
//
// Columns:
//   ahead   commits on the branch that are NOT on the base (unique work)
//   behind  commits on the base that the branch is missing (how stale vs base)
//   inbase  "yes" when every commit already has an equivalent in the base
//           (`git cherry` patch-id match — catches ordinary merges; squash
//           merges won't match, so a squash-merged branch shows inbase=no and
//           still needs a PR-status check)
//   age     days since the branch tip was last committed to
//   date    tip commit date (ISO, local)

import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const doFetch = !args.includes('--no-fetch');
const baseIdx = args.indexOf('--base');
const base = baseIdx !== -1 ? args[baseIdx + 1] : 'main';

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();

if (doFetch) {
  process.stderr.write('Fetching origin with --prune…\n');
  git('fetch origin --prune');
}

const currentBranch = git('rev-parse --abbrev-ref HEAD');
const baseRef = `origin/${base}`;

const refLines = git(
  `for-each-ref --format='%(refname:short)%09%(committerdate:iso8601)%09%(committerdate:unix)%09%(authorname)%09%(subject)' refs/remotes/origin`
).split('\n');

const now = Math.floor(Date.now() / 1000);
const rows = [];

for (const line of refLines) {
  if (!line) continue;
  const [shortRef, isoDate, unix, author, subject] = line.split('\t');
  const branch = shortRef.replace(/^origin\//, '');
  if (branch === 'HEAD' || branch === base) continue;

  const ahead = Number(git(`rev-list --count ${baseRef}..${shortRef}`));
  const behind = Number(git(`rev-list --count ${shortRef}..${baseRef}`));

  let inbase = ahead === 0;
  if (ahead > 0) {
    const cherry = git(`cherry ${baseRef} ${shortRef}`);
    inbase = cherry.length > 0 && !cherry.split('\n').some((l) => l.startsWith('+'));
  }

  const ageDays = Math.floor((now - Number(unix)) / 86400);

  rows.push({
    branch,
    ahead,
    behind,
    inbase,
    ageDays,
    date: isoDate.slice(0, 10),
    author,
    subject,
    isCurrent: branch === currentBranch,
  });
}

rows.sort((a, b) => b.ageDays - a.ageDays);

if (asJson) {
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  const nameW = Math.min(48, Math.max(6, ...rows.map((r) => r.branch.length)));
  process.stdout.write(
    `${pad('branch', nameW)}  ${padL('ahead', 5)} ${padL('behind', 6)}  ${pad('inbase', 6)}  ${padL(
      'age',
      4
    )}  ${pad('date', 10)}  subject\n`
  );
  for (const r of rows) {
    const mark = r.isCurrent ? ' *' : '  ';
    process.stdout.write(
      `${pad(r.branch, nameW)}${mark}${padL(r.ahead, 3)} ${padL(r.behind, 6)}  ${pad(
        r.inbase ? 'yes' : 'no',
        6
      )}  ${padL(r.ageDays + 'd', 4)}  ${pad(r.date, 10)}  ${r.subject}\n`
    );
  }
  process.stdout.write(
    `\n${rows.length} branches (base=${base}). "*" = current checkout. inbase=yes or ahead=0 are easy kills.\n`
  );
}
