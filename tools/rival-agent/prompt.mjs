import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const RIVAL_PROMPT_PATH = join(PROMPT_DIRECTORY, 'rival-prompt.md');
// The execution section is the one part of the contract that depends on how the rival was
// launched: through the broker (its shell cannot write, `run` is its one door) or inside a
// workspace-write sandbox with no broker at all.
export const EXECUTION_PARTIAL_PATHS = Object.freeze({
  broker: join(PROMPT_DIRECTORY, 'rival-prompt-broker.md'),
  sandbox: join(PROMPT_DIRECTORY, 'rival-prompt-sandbox.md'),
});
export const MAX_PROMPT_BYTES = 256 * 1024;

export function readPromptFile(path) {
  if (!isAbsolute(path)) throw new Error('--prompt-file must be absolute');
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error('--prompt-file must name a regular file');
  // Sized before reading so an enormous file is refused rather than decoded into memory first; the
  // post-read check still catches a file that grew between the two.
  if (stats.size > MAX_PROMPT_BYTES)
    throw new Error(`--prompt-file exceeds ${MAX_PROMPT_BYTES} bytes`);
  const prompt = readFileSync(path, 'utf8');
  if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
    throw new Error(`--prompt-file exceeds ${MAX_PROMPT_BYTES} bytes`);
  }
  if (!prompt.trim()) throw new Error('--prompt-file is empty');
  return prompt;
}

export function describeTask({ scope, question }) {
  if (question) {
    return `Your task is a question about this checkout, answered with the evidence in front of you:\n\n${question}\n\nPut the answer in \`summary\`; \`findings\` may be empty.`;
  }
  return `Your task is a review of ${scope.description} — the range \`${scope.range}\`. Report only defects you can point to in the diff.`;
}

// `landedCommits` is undefined when the range could not be listed at all, which is not the same
// as an empty range: a rebased or amended branch must not be described as unchanged.
export function describeRound({ round, previous, landedCommits }) {
  if (round === 1) return '';
  const landed =
    landedCommits === undefined
      ? `Could not list what landed since your last round: the recorded head ${previous.lastHead} is no longer reachable, so the branch was probably rebased or amended. Treat the whole range as unreviewed rather than assuming nothing changed.`
      : `Since your last round these commits landed:\n\n${landedCommits || '(no new commits)'}`;
  return [
    `## Round ${round}`,
    `This is round ${round} of your review; rounds 1 through ${round - 1} are earlier in this conversation. ${landed}`,
    'Two jobs, in order: first check whether the findings you already reported were actually addressed, and say so for each — a fix that misses the point is worth more than a new finding. Then review what changed since your last round. Do not re-report findings that were fixed, and do not re-litigate ones you withdrew. Raise a new finding only when it is a concrete defect introduced by the response, could not have been observed on the prior range, or is a high-confidence critical defect whose shipping risk outweighs the earlier miss.',
  ].join('\n\n');
}

function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!(name in values)) throw new Error(`rival prompt has no value for ${match}`);
    return values[name];
  });
}

// What differs between a brokered rival and a sandboxed one, beyond the execution section: who the
// handler is to it, what it may do to the worktree, and how it reproduces a claim.
export function describeExecutionMode(broker) {
  if (broker) {
    return {
      HANDLER:
        'A **native handler** — the agent that launched you — holds every permission you lack and is waiting to run commands for you.',
      WORKTREE_RULES:
        'It is read-only to you and nobody else will ever see it. Do not try to edit, commit, or reach outside it.',
      VERIFY_HOW: 'through `run`',
    };
  }
  return {
    HANDLER:
      'The **native handler** that launched you will read your findings when you finish; it will not run commands for you.',
    WORKTREE_RULES:
      'Nobody else will ever see it. Your shell may write inside it — test caches, build output, a scratch script — and nowhere else. Do not commit, and do not try to reach outside it.',
    VERIFY_HOW: 'by running it',
  };
}

export function buildRivalPrompt({
  scope,
  question,
  worktree,
  packetDir,
  round = 1,
  previous,
  landedCommits,
  extraInstructions,
  broker = true,
  toolBoundary,
  template = readFileSync(RIVAL_PROMPT_PATH, 'utf8'),
  executionTemplate = readFileSync(
    broker ? EXECUTION_PARTIAL_PATHS.broker : EXECUTION_PARTIAL_PATHS.sandbox,
    'utf8'
  ),
}) {
  return fill(template, {
    TASK: describeTask({ scope, question }),
    WORKTREE: worktree,
    PACKET_DIR: packetDir,
    RANGE: scope.range,
    ...describeExecutionMode(broker),
    EXECUTION: fill(executionTemplate, { LOCAL_TOOL_BOUNDARY: toolBoundary }).trim(),
    ROUND: describeRound({ round, previous, landedCommits }),
    EXTRA: extraInstructions
      ? `## Extra instructions from the handler\n\n${extraInstructions}`
      : '',
  }).replace(/\n{3,}/g, '\n\n');
}
