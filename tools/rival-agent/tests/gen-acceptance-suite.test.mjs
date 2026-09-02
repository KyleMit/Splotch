import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  generateAcceptanceSuite,
  handlerBrief,
  parseAcceptanceArgs,
} from '../gen-acceptance-suite.mjs';
import { MAX_INLINE_OUTPUT_CHARS, truncateOutput } from '../spool.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const NONCE = 'feedfacecafebeef00112233';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rival-acceptance-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function fencedCommands(question) {
  return [...question.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

// The same shape the handler's own shell gives a brokered command: a subshell in the worktree.
function run(command) {
  return spawnSync('bash', ['-c', command], { cwd: repositoryRoot, encoding: 'utf8' });
}

describe('acceptance suite generator', () => {
  it('writes an owner-only question with the nonce in place of every placeholder', () => {
    const outputDirectory = join(root, 'suite');
    const result = generateAcceptanceSuite({ outputDirectory, nonce: NONCE });
    expect(result).toEqual({
      suiteDirectory: outputDirectory,
      questionPath: join(outputDirectory, 'question.md'),
      nonce: NONCE,
    });
    const question = readFileSync(result.questionPath, 'utf8');
    expect(question).toContain(`The suite nonce is \`${NONCE}\``);
    expect(question).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(statSync(outputDirectory).mode & 0o077).toBe(0);
    expect(statSync(result.questionPath).mode & 0o077).toBe(0);
  });

  it('refuses to write into a directory that already exists', () => {
    const outputDirectory = join(root, 'suite');
    generateAcceptanceSuite({ outputDirectory, nonce: NONCE });
    expect(() => generateAcceptanceSuite({ outputDirectory, nonce: NONCE })).toThrow(/EEXIST/);
  });

  it('accepts only an optional output directory', () => {
    expect(parseAcceptanceArgs([])).toEqual({ outputDirectory: undefined });
    expect(parseAcceptanceArgs(['--output-dir', 'rel'])).toEqual({
      outputDirectory: resolve('rel'),
    });
    expect(() => parseAcceptanceArgs(['--output-dir', ''])).toThrow(/usage/);
    expect(() => parseAcceptanceArgs(['extra'])).toThrow();
  });
});

// The staged commands are copied verbatim by the rival and executed verbatim by the handler, so
// the template's shell escaping has to produce the outputs the question demands. A `\\n` that
// reached Node as two characters once turned the parser probe's expected anchors into `[]`.
describe('acceptance stage commands, executed as shipped', () => {
  let commands;

  beforeEach(() => {
    const { questionPath } = generateAcceptanceSuite({
      outputDirectory: join(root, 'suite'),
      nonce: NONCE,
    });
    commands = fencedCommands(readFileSync(questionPath, 'utf8'));
  });

  it('stages exactly the seven commands the handler brief expects, decline last', () => {
    expect(commands).toHaveLength(7);
    expect(commands[6]).toMatch(/^git -C \/\S+ status --short$/);
    expect(commands[6]).not.toContain(NONCE);
    const brief = handlerBrief('/suite/question.md');
    expect(brief[0]).toContain('--question-file /suite/question.md');
    const numbered = brief.filter((line) => /^\d\. /.test(line));
    expect(numbered).toHaveLength(commands.length);
    expect(
      numbered
        .slice(0, 6)
        .every((line) => line.startsWith(`${numbered.indexOf(line) + 1}. Approve`))
    ).toBe(true);
    expect(numbered[6]).toMatch(/^7\. Decline/);
  });

  it('chains a generated reply token from the handshake into the carry request', () => {
    const handshake = run(commands[0]);
    expect(handshake.status).toBe(0);
    const reply = JSON.parse(handshake.stdout);
    expect(reply).toMatchObject({ stage: 'handshake', suiteNonce: NONCE });
    expect(reply.replyToken).toMatch(UUID);
    expect(commands[1]).toContain("'<replyToken>'");
    const carry = run(commands[1].replace('<replyToken>', reply.replyToken));
    expect(JSON.parse(carry.stdout)).toEqual({ stage: 'carry', replyToken: reply.replyToken });
  });

  it('exits 23 with a marker on each stream, then recovers', () => {
    const nonzero = run(commands[2]);
    expect(nonzero.status).toBe(23);
    expect(nonzero.stdout).toBe(`STDOUT:${NONCE}\n`);
    expect(nonzero.stderr).toBe(`STDERR:${NONCE}\n`);
    const recovery = run(commands[3]);
    expect(JSON.parse(recovery.stdout)).toEqual({
      stage: 'recovery',
      observedExit: 23,
      nonce: NONCE,
    });
  });

  it('overflows the inline reply while both boundary markers survive truncation', () => {
    const large = run(commands[4]);
    expect(large.status).toBe(0);
    expect(large.stdout.length).toBeGreaterThan(MAX_INLINE_OUTPUT_CHARS);
    const { text, truncated } = truncateOutput(large.stdout);
    expect(truncated).toBe(true);
    expect(text).toContain(`BEGIN:${NONCE}`);
    expect(text).toContain(`END:${NONCE}`);
  });

  it('reproduces the header-inside-hunk parser case with the required anchors', () => {
    const [probe, suffix] = commands[5].split(' && ');
    expect(suffix).toMatch(
      /^npx vitest run --config tools\/vitest\.config\.mjs rival-agent\/tests$/
    );
    const result = run(probe);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { path: 'db/schema.sql', RIGHT: [1, 2, 3], LEFT: [1, 2, 3] },
    ]);
  });
});
