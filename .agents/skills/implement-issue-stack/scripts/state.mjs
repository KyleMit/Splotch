#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'KyleMit/Splotch';
const VALID_STATUSES = new Set([
  'pending',
  'implementing',
  'pr-open',
  'ci',
  'reviewing',
  'addressing',
  'ready',
  'quarantined',
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATE_PATH = resolve(scriptDirectory, '../../../../.issue-stack/run.json');

export function parseIssueReferences(values, repository = REPOSITORY) {
  const tokens = values.flatMap((value) => value.split(/[\s,]+/)).filter(Boolean);
  if (tokens.length === 0) throw new Error('provide at least one issue reference');

  const numbers = tokens.map((token) => {
    const shortMatch = token.match(/^#?(\d+)$/);
    if (shortMatch) return Number(shortMatch[1]);

    let url;
    try {
      url = new URL(token);
    } catch {
      throw new Error(`invalid issue reference: ${token}`);
    }
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/);
    if (url.hostname !== 'github.com' || !match) throw new Error(`invalid issue URL: ${token}`);
    const urlRepository = `${match[1]}/${match[2]}`;
    if (urlRepository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error(`issue belongs to ${urlRepository}, expected ${repository}: ${token}`);
    }
    return Number(match[3]);
  });

  const duplicate = numbers.find((number, index) => numbers.indexOf(number) !== index);
  if (duplicate) throw new Error(`duplicate issue reference: ${duplicate}`);
  return numbers;
}

function writeState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporaryPath, statePath);
}

export function initializeRun(statePath, references, trunk, trunkOid) {
  const issueNumbers = parseIssueReferences(references);
  if (!trunk) throw new Error('provide --trunk <branch>');
  if (!/^[0-9a-f]{40}$/i.test(trunkOid ?? '')) throw new Error('provide --trunk-oid <40-char SHA>');

  if (existsSync(statePath)) {
    const existing = JSON.parse(readFileSync(statePath, 'utf8'));
    if (existing.version !== 1 || existing.repository !== REPOSITORY || existing.trunk !== trunk) {
      throw new Error('existing checkpoint has an incompatible schema, repository, or trunk');
    }
    const existingNumbers = existing.issues?.map(({ number }) => number);
    if (JSON.stringify(existingNumbers) !== JSON.stringify(issueNumbers)) {
      throw new Error('existing checkpoint belongs to a different ordered issue list');
    }
    return { state: existing, resumed: true };
  }

  const state = {
    version: 1,
    repository: REPOSITORY,
    trunk,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastGoodBase: trunk,
    lastGoodBaseOid: trunkOid,
    issues: issueNumbers.map((number, index) => ({
      number,
      order: index + 1,
      status: 'pending',
    })),
  };
  writeState(statePath, state);
  return { state, resumed: false };
}

export function updateIssue(statePath, number, fields) {
  if (!existsSync(statePath)) throw new Error('issue-stack checkpoint does not exist');
  if (!VALID_STATUSES.has(fields.status)) throw new Error(`invalid status: ${fields.status}`);
  if (fields.status === 'ready' && (!fields.branch || !/^[0-9a-f]{40}$/i.test(fields.head ?? ''))) {
    throw new Error('ready status requires --branch and --head <40-char SHA>');
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const issue = state.issues.find((candidate) => candidate.number === number);
  if (!issue) throw new Error(`issue ${number} is not in this run`);

  const { stackNumber, clearStack, ...issueFields } = fields;
  Object.assign(issue, issueFields, { updatedAt: new Date().toISOString() });
  if (clearStack) state.stackNumber = null;
  else if (stackNumber !== undefined) state.stackNumber = stackNumber;
  if (fields.status === 'ready' && fields.branch && fields.head) {
    state.lastGoodBase = fields.branch;
    state.lastGoodBaseOid = fields.head;
  }
  state.updatedAt = new Date().toISOString();
  writeState(statePath, state);
  return state;
}

export function runStateCli(argv = process.argv.slice(2), statePath = DEFAULT_STATE_PATH) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      trunk: { type: 'string' },
      'trunk-oid': { type: 'string' },
      status: { type: 'string' },
      branch: { type: 'string' },
      'base-branch': { type: 'string' },
      'base-oid': { type: 'string' },
      pr: { type: 'string' },
      agent: { type: 'string' },
      worktree: { type: 'string' },
      head: { type: 'string' },
      stack: { type: 'string' },
      'clear-stack': { type: 'boolean', default: false },
      'ci-repairs': { type: 'string' },
      'review-round': { type: 'string' },
      error: { type: 'string' },
    },
  });
  const [command, ...arguments_] = positionals;

  if (command === 'init') {
    const result = initializeRun(statePath, arguments_, values.trunk, values['trunk-oid']);
    console.log(
      result.resumed
        ? 'resuming existing issue-stack checkpoint'
        : 'initialized issue-stack checkpoint'
    );
    return result.state;
  }
  if (command === 'show') {
    if (!existsSync(statePath)) throw new Error('issue-stack checkpoint does not exist');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    console.log(JSON.stringify(state, null, 2));
    return state;
  }
  if (command === 'update') {
    const [issueText] = arguments_;
    if (!/^\d+$/.test(issueText ?? '')) throw new Error('update requires a numeric issue');
    const fields = Object.fromEntries(
      Object.entries({
        status: values.status,
        branch: values.branch,
        baseBranch: values['base-branch'],
        baseOid: values['base-oid'],
        pr: values.pr ? Number(values.pr) : undefined,
        agent: values.agent,
        worktree: values.worktree,
        head: values.head,
        stackNumber: values.stack ? Number(values.stack) : undefined,
        clearStack: values['clear-stack'],
        ciRepairContinuations: values['ci-repairs'] ? Number(values['ci-repairs']) : undefined,
        reviewRounds: values['review-round'] ? Number(values['review-round']) : undefined,
        error: values.error,
      }).filter(([, value]) => value !== undefined)
    );
    if (!fields.status) throw new Error('update requires --status');
    const state = updateIssue(statePath, Number(issueText), fields);
    console.log(`updated issue ${issueText} to ${fields.status}`);
    return state;
  }
  throw new Error('usage: state.mjs <init|show|update> ...');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runStateCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
