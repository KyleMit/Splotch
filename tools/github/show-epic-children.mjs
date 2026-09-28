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
    '.[] | {number,title,state,state_reason,labels:[.labels[].name],assignees:[.assignees[].login],html_url,repository_url} | @json',
  ]);
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => parseGitHubJson(line, `sub-issues of ${parent}`));
}

function childRepository(child) {
  const apiPath = child.repository_url && new URL(child.repository_url).pathname;
  const pagePath = child.html_url && new URL(child.html_url).pathname;
  const match =
    apiPath?.match(/^\/repos\/([\w.-]+\/[\w.-]+)$/) ??
    pagePath?.match(/^\/([\w.-]+\/[\w.-]+)\/issues\/\d+$/);
  if (!match) throw new Error(`Sub-issue ${child.number} has no valid repository URL`);
  return match[1];
}

function issueKey(repository, number) {
  return `${repository}#${number}`;
}

export function collectEpicChildren({ number, repository, run = runGitHub }) {
  const repo = resolveRepository(repository, run);
  const root = parseGitHubJson(run(['api', `repos/${repo}/issues/${number}`]), 'epic issue');
  if (root.number !== number || !root.title) throw new Error('Epic issue response is incomplete');
  const queue = [{ repository: repo, number }];
  const visited = new Set();
  const unique = new Map();
  const parents = [];
  const duplicates = [];
  while (queue.length) {
    const parent = queue.shift();
    const parentKey = issueKey(parent.repository, parent.number);
    if (visited.has(parentKey)) continue;
    visited.add(parentKey);
    const children = readChildren(parent.number, parent.repository, run);
    parents.push({ ...parent, count: children.length });
    for (const child of children) {
      if (!Number.isSafeInteger(child.number) || !child.title || !child.state) {
        throw new Error(`Sub-issue response for parent ${parentKey} is incomplete`);
      }
      const childRepo = childRepository(child);
      const childKey = issueKey(childRepo, child.number);
      if (unique.has(childKey)) {
        duplicates.push({
          number: child.number,
          repository: childRepo,
          parent: parent.number,
          parentRepository: parent.repository,
          firstParent: unique.get(childKey).parent,
          firstParentRepository: unique.get(childKey).parentRepository,
        });
        continue;
      }
      unique.set(childKey, {
        number: child.number,
        repository: childRepo,
        parent: parent.number,
        parentRepository: parent.repository,
        title: child.title,
        state: child.state,
        stateReason: child.state_reason ?? null,
        labels: child.labels ?? [],
        assignees: child.assignees ?? [],
        url: child.html_url,
      });
      queue.push({ repository: childRepo, number: child.number });
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
    ...parents.map(
      ({ repository: parentRepo, number, count }) =>
        `Parent ${issueKey(parentRepo, number)}: ${count} direct children`
    ),
    ...children.map(
      (child) =>
        `  ${issueKey(child.repository, child.number)} [${child.state}${child.stateReason ? `/${child.stateReason}` : ''}] parent=${issueKey(child.parentRepository, child.parent)} labels=${child.labels.join(',') || '-'} assignees=${child.assignees.join(',') || '-'} ${child.title}`
    ),
  ];
  if (duplicates.length)
    lines.push(
      `Repeated descendants: ${duplicates.map((item) => issueKey(item.repository, item.number)).join(', ')}`
    );
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
