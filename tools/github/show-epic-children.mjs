import { parseArgs } from 'node:util';
import { isMain, runMain } from '../lib/proc.mjs';
import {
  parseGitHubJson,
  parseIssueNumber,
  resolveRepository,
  runGitHub,
} from './lib/github-cli.mjs';

function readChildren(parent, repository, run) {
  const output = run([
    'api',
    `repos/${repository}/issues/${parent}/sub_issues`,
    '--paginate',
    '--jq',
    '.[] | @json',
  ]);
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => parseGitHubJson(line, `sub-issues of ${parent}`));
}

export function collectEpicChildren({ number, repository, run = runGitHub }) {
  const repo = resolveRepository(repository, run);
  const root = parseGitHubJson(run(['api', `repos/${repo}/issues/${number}`]), 'epic issue');
  if (root.number !== number || !root.title) throw new Error('Epic issue response is incomplete');
  const queue = [number];
  const visited = new Set();
  const unique = new Map();
  const parents = [];
  const duplicates = [];
  while (queue.length) {
    const parent = queue.shift();
    if (visited.has(parent)) continue;
    visited.add(parent);
    const children = readChildren(parent, repo, run);
    parents.push({ number: parent, count: children.length });
    for (const child of children) {
      if (!Number.isSafeInteger(child.number) || !child.title || !child.state) {
        throw new Error(`Sub-issue response for parent ${parent} is incomplete`);
      }
      if (unique.has(child.number)) {
        duplicates.push({
          number: child.number,
          parent,
          firstParent: unique.get(child.number).parent,
        });
        continue;
      }
      unique.set(child.number, {
        number: child.number,
        parent,
        title: child.title,
        state: child.state,
        stateReason: child.state_reason ?? null,
        labels: (child.labels ?? []).map((label) => label.name),
        assignees: (child.assignees ?? []).map((assignee) => assignee.login),
        url: child.html_url,
      });
      queue.push(child.number);
    }
  }
  return {
    repository: repo,
    root: { number, title: root.title },
    parents,
    children: [...unique.values()],
    duplicates,
  };
}

export function formatEpicChildren({ repository, root, parents, children, duplicates }) {
  const lines = [
    `${repository} epic ${root.number}: ${root.title}`,
    `Unique descendants: ${children.length}`,
    ...parents.map(({ number, count }) => `Parent ${number}: ${count} direct children`),
    ...children.map(
      (child) =>
        `  ${child.number} [${child.state}] parent=${child.parent} labels=${child.labels.join(',') || '-'} assignees=${child.assignees.join(',') || '-'} ${child.title}`
    ),
  ];
  if (duplicates.length)
    lines.push(`Repeated descendants: ${duplicates.map((item) => item.number).join(', ')}`);
  return lines.join('\n');
}

export async function showEpicChildren(argv = process.argv.slice(2), run = runGitHub) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { repo: { type: 'string' }, json: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (positionals.length !== 1)
    throw new Error('Usage: npm run show:epic-children -- <number> [--repo owner/name] [--json]');
  const result = collectEpicChildren({
    number: parseIssueNumber(positionals[0]),
    repository: values.repo,
    run,
  });
  console.log(values.json ? JSON.stringify(result, null, 2) : formatEpicChildren(result));
}

if (isMain(import.meta.url)) runMain(showEpicChildren);
