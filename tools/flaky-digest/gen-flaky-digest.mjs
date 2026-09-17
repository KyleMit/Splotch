#!/usr/bin/env node

// Harvests the flaky.json records from the Tests workflow's Playwright report artifacts into a
// persisted history, then ranks the masked flakes in it. See tools/flaky-digest/README.md.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import { buildDigest, renderDigestMarkdown } from './lib/flaky-digest-report.mjs';
import {
  createHistory,
  FLAKY_HISTORY_ARTIFACT_NAME,
  FLAKY_HISTORY_FILENAME,
  harvest,
  parseHistory,
} from './lib/flaky-history.mjs';
import { createGithubActionsApi } from './lib/github-actions-api.mjs';

const DEFAULT_REPO = 'KyleMit/Splotch';
const DEFAULT_OUT_DIR = join(ROOT, 'test-results', 'flaky-digest');
const DEFAULT_WINDOW_DAYS = 7;

const DIGEST_JSON_FILENAME = 'flaky-digest.json';
const DIGEST_MARKDOWN_FILENAME = 'flaky-digest.md';

const USAGE = `Usage: npm run gen:flaky-digest -- [options]

  --out <dir>        Where flaky-history.json and the digest are written (default test-results/flaky-digest)
  --history <file>   Start from this history file instead of the latest ${FLAKY_HISTORY_ARTIFACT_NAME} artifact
  --fresh            Start an empty history (a first harvest, or deliberately discarding the old one)
  --days <n>         Ranking window in days (default ${DEFAULT_WINDOW_DAYS})
  --repo <owner/name> (default ${DEFAULT_REPO})

Auth: GITHUB_TOKEN or GH_TOKEN, else \`gh auth token\`.`;

function readOptions(argv) {
  const { values } = parseOrFail(() =>
    parseArgs({
      args: argv,
      options: {
        out: { type: 'string', default: DEFAULT_OUT_DIR },
        history: { type: 'string' },
        fresh: { type: 'boolean', default: false },
        days: { type: 'string', default: String(DEFAULT_WINDOW_DAYS) },
        repo: { type: 'string', default: DEFAULT_REPO },
        help: { type: 'boolean', default: false },
      },
    })
  );
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) throw new Error(`--days must be a positive integer`);
  if (values.history && values.fresh) throw new Error('--history and --fresh are exclusive');
  if (values.history && !existsSync(values.history)) {
    throw new Error(`--history ${values.history} does not exist`);
  }
  return { ...values, days, out: resolve(values.out) };
}

function resolveToken(env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (token) return token;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'No GitHub token: set GITHUB_TOKEN or GH_TOKEN, or sign in with `gh auth login`'
    );
  }
}

async function loadHistory(api, options) {
  if (options.fresh) return { history: createHistory(), source: 'fresh' };
  if (options.history) {
    return {
      history: parseHistory(readFileSync(options.history, 'utf8'), options.history),
      source: options.history,
    };
  }
  const artifact = await api.findLatestArtifact(FLAKY_HISTORY_ARTIFACT_NAME);
  if (!artifact) {
    throw new Error(
      `No unexpired ${FLAKY_HISTORY_ARTIFACT_NAME} artifact exists. Pass --fresh to start a new ` +
        'history; the digest will then report that everything before now was never harvested.'
    );
  }
  const source = `artifact ${artifact.id} (${artifact.created_at})`;
  const text = await api.readArtifactFile(artifact.id, FLAKY_HISTORY_FILENAME);
  if (text === null) throw new Error(`${source} holds no ${FLAKY_HISTORY_FILENAME}`);
  return { history: parseHistory(text, source), source };
}

export async function generateFlakyDigest(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const options = readOptions(argv);
  const now = new Date();
  const api = createGithubActionsApi({ repo: options.repo, token: resolveToken(env) });
  const { history, source } = await loadHistory(api, options);
  console.log(`History: ${source}`);

  const summary = await harvest(api, history, now);
  console.log(
    `Harvest: ${summary.runsListed} runs listed since ${summary.listedSince}, ` +
      `${summary.artifactsAdded} new report artifacts, ${summary.artifactsRead} read`
  );
  for (const error of summary.errors) console.warn(`warning: ${error}`);

  const digest = buildDigest(history, { now, days: options.days });
  const markdown = renderDigestMarkdown(digest);
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, FLAKY_HISTORY_FILENAME), `${JSON.stringify(history)}\n`);
  writeFileSync(join(options.out, DIGEST_JSON_FILENAME), `${JSON.stringify(digest, null, 2)}\n`);
  writeFileSync(join(options.out, DIGEST_MARKDOWN_FILENAME), markdown);
  if (env.GITHUB_STEP_SUMMARY) writeFileSync(env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' });
  console.log(`Wrote ${options.out}`);
}

if (isMain(import.meta.url)) runMain(() => generateFlakyDigest());
