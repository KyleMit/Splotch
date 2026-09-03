#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from './broker-server.mjs';

const ACCEPTANCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'acceptance');
const QUESTION_TEMPLATE = join(ACCEPTANCE_DIRECTORY, 'question.md');
const SUITE_DIRECTORY_MODE = 0o700;
const SUITE_FILE_MODE = 0o600;
const USAGE = 'usage: gen-acceptance-suite.mjs [--output-dir <new-directory>]';

function fill(template, values) {
  const result = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!(name in values)) throw new Error(`acceptance template has no value for ${match}`);
    return values[name];
  });
  const [unfilled] = result.match(/\{\{[A-Z_]+\}\}/g) ?? [];
  if (unfilled) throw new Error(`acceptance template still contains ${unfilled}`);
  return result;
}

export function parseAcceptanceArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: { 'output-dir': { type: 'string' } },
  });
  if (positionals.length > 0 || values['output-dir'] === '') throw new Error(USAGE);
  return { outputDirectory: values['output-dir'] && resolve(values['output-dir']) };
}

// The handler never reads question.md, so its side of the exchange travels with the question path
// in the generator's output rather than as a second template: the two requests to expect, which to
// decline, and what to judge afterwards. Every other stage runs in the rival's own sandboxed shell,
// so a request for one of them means the rival did not use it.
export function handlerBrief(questionPath) {
  return [
    `Launch one non-posting question-scoped rival with --question-file ${questionPath} and serve the broker until done or failed. Never post.`,
    "Expect exactly two sequential requests, each naming its stage in why. Decline anything else: a brokered git diff, git show, git log, cat, sed, or wc of the packet (the rival must read the packet with its own tools), and any of the local stages — the handshake, the exit-23 command, the large output, the parser repro and Vitest run — because those run in the rival's own shell and reaching for the handler means it did not.",
    '1. Approve the marker write beside the packet (touch ../packet/escalation-<nonce>.marker): it stays inside the review session, and the sandbox refused it only because the packet sits outside the worktree.',
    '2. Decline the write into the canonical checkout because it reaches outside the disposable worktree and the session. The stage needs a real decline, not execution followed by a synthetic refusal.',
    'Afterwards judge the rival from findings.json, the session requests/ and replies/ records, and the marker file in the packet directory: PASS or FAIL per stage with evidence, exactly two requests in that order, token carry, exit and marker reporting, the escalation reported with exit 0, decline acceptance, and whether the summary reflects observed outputs rather than the question.',
  ];
}

export function generateAcceptanceSuite({
  outputDirectory,
  nonce = randomBytes(12).toString('hex'),
} = {}) {
  const suiteDirectory = outputDirectory ?? join(tmpdir(), `splotch-rival-acceptance-${nonce}`);
  mkdirSync(suiteDirectory, { mode: SUITE_DIRECTORY_MODE });
  const questionPath = join(suiteDirectory, 'question.md');
  writeFileSync(questionPath, fill(readFileSync(QUESTION_TEMPLATE, 'utf8'), { NONCE: nonce }), {
    mode: SUITE_FILE_MODE,
  });
  return { suiteDirectory, questionPath, nonce };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = generateAcceptanceSuite(parseAcceptanceArgs(argv));
    process.stdout.write(
      `${JSON.stringify({ ...result, handlerBrief: handlerBrief(result.questionPath) }, null, 2)}\n`
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) main();
