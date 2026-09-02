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
const HANDOFF_TEMPLATE = join(ACCEPTANCE_DIRECTORY, 'handoff.md');
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

export function generateAcceptanceSuite({
  outputDirectory,
  nonce = randomBytes(12).toString('hex'),
} = {}) {
  const suiteDirectory = outputDirectory ?? join(tmpdir(), `splotch-rival-acceptance-${nonce}`);
  mkdirSync(suiteDirectory, { mode: SUITE_DIRECTORY_MODE });
  const questionPath = join(suiteDirectory, 'question.md');
  const handoffPath = join(suiteDirectory, 'HANDOFF.md');
  const values = {
    NONCE: nonce,
    QUESTION_PATH: questionPath,
    SUITE_DIRECTORY: suiteDirectory,
  };
  writeFileSync(questionPath, fill(readFileSync(QUESTION_TEMPLATE, 'utf8'), values), {
    mode: SUITE_FILE_MODE,
  });
  writeFileSync(handoffPath, fill(readFileSync(HANDOFF_TEMPLATE, 'utf8'), values), {
    mode: SUITE_FILE_MODE,
  });
  return { suiteDirectory, questionPath, handoffPath, nonce };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = generateAcceptanceSuite(parseAcceptanceArgs(argv));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) main();
