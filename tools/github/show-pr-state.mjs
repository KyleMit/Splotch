import { parseArgs } from 'node:util';
import { isMain, runMain } from '../lib/proc.mjs';
import {
  parseGitHubJson,
  parseIssueNumber,
  resolveRepository,
  runGitHub,
} from './lib/github-cli.mjs';

const REVIEW_PAGE_SIZE = 100;

function reviewThreads(number, repository, run) {
  const [owner, name] = repository.split('/');
  const query = `query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:${REVIEW_PAGE_SIZE},after:$after){pageInfo{hasNextPage endCursor} nodes{id isResolved path line}}}}}`;
  const threads = [];
  let cursor;
  let hasNextPage;
  do {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${number}`,
    ];
    if (cursor) args.push('-f', `after=${cursor}`);
    const result = parseGitHubJson(run(args), 'review threads');
    const page = result.data?.repository?.pullRequest?.reviewThreads;
    if (
      result.errors?.length ||
      !page ||
      !Array.isArray(page.nodes) ||
      typeof page.pageInfo?.hasNextPage !== 'boolean'
    )
      throw new Error('Review threads response is incomplete');
    threads.push(...page.nodes);
    hasNextPage = page.pageInfo?.hasNextPage === true;
    if (hasNextPage && (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor)) {
      throw new Error('Review thread pagination stopped advancing');
    }
    cursor = page.pageInfo?.endCursor;
  } while (hasNextPage);
  return threads;
}

export function collectPrState({ number, repository, run = runGitHub }) {
  const repo = resolveRepository(repository, run);
  const pr = parseGitHubJson(
    run([
      'pr',
      'view',
      String(number),
      '-R',
      repo,
      '--json',
      'number,url,headRefOid,baseRefName,mergeable,mergeStateStatus,isDraft,state,reviewDecision',
    ]),
    'gh pr view'
  );
  if (pr.number !== number || !pr.headRefOid) throw new Error('PR response is incomplete');

  const checksResult = run(
    ['pr', 'checks', String(number), '-R', repo, '--json', 'name,state,bucket,workflow,link'],
    { allowedExitCodes: [0, 1, 8], includeResult: true }
  );
  const noChecks =
    checksResult.status === 1 &&
    !checksResult.stdout.trim() &&
    /no checks reported on the .* branch/i.test(checksResult.stderr);
  const checks = noChecks
    ? []
    : parseGitHubJson(
        checksResult.stdout,
        `gh pr checks${checksResult.stderr.trim() ? `: ${checksResult.stderr.trim()}` : ''}`
      );
  if (!Array.isArray(checks)) throw new Error('Checks response is incomplete');
  const threads = reviewThreads(number, repo, run);
  const latest = parseGitHubJson(
    run(['pr', 'view', String(number), '-R', repo, '--json', 'headRefOid']),
    'gh pr view'
  );
  if (latest.headRefOid !== pr.headRefOid) {
    throw new Error(
      `PR head moved while collecting state: ${pr.headRefOid} → ${latest.headRefOid}`
    );
  }

  return { repository: repo, pr, checks, threads };
}

export function formatPrState({ repository, pr, checks, threads }) {
  const lines = [
    `${repository} PR ${pr.number}: ${pr.url}`,
    `Head: ${pr.headRefOid}  Base: ${pr.baseRefName}`,
    `State: ${pr.state}  Draft: ${pr.isDraft}  Merge: ${pr.mergeable}/${pr.mergeStateStatus}  Review: ${pr.reviewDecision ?? 'none'}`,
    `Registered checks: ${checks.length} (additional checks may still register)`,
  ];
  for (const check of checks)
    lines.push(
      `  ${check.bucket ?? check.state}: ${check.workflow ? `${check.workflow} / ` : ''}${check.name}`
    );
  const open = threads.filter((thread) => !thread.isResolved);
  lines.push(`Review threads: ${threads.length} total, ${open.length} unresolved`);
  for (const thread of open) lines.push(`  ${thread.path}:${thread.line ?? '?'} ${thread.id}`);
  return lines.join('\n');
}

export async function showPrState(argv = process.argv.slice(2), run = runGitHub) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { repo: { type: 'string' }, json: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (positionals.length !== 1)
    throw new Error('Usage: npm run show:pr-state -- <number> [--repo owner/name] [--json]');
  const state = collectPrState({
    number: parseIssueNumber(positionals[0]),
    repository: values.repo,
    run,
  });
  console.log(values.json ? JSON.stringify(state, null, 2) : formatPrState(state));
}

if (isMain(import.meta.url)) runMain(showPrState);
