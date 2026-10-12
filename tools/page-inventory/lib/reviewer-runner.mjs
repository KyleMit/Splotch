import { copyFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  agentRunnerDefaults,
  normalizeAgentRunner,
  parseSavedAgentOutput,
} from '../../audit-burndown/lib/agent-runner.mjs';
import { hasCommand } from '../../lib/proc.mjs';

// The reviewer is one isolated look at one image. Both runners get the same
// contract; only how an image reaches them differs — codex takes --image, while
// Claude Code reads the file, so the image is copied into the empty working
// root and named in the prompt.
export const REVIEWER_RUNNERS = ['claude', 'codex'];

// A review is read-the-image then answer, but a reviewer that looks twice or
// thinks first needs more room, and running out shows up as an exhausted turn
// budget with no structured output — indistinguishable from a crash in the exit
// code. Four turns failed roughly a quarter of first attempts across a
// 672-capture run; the retry hid most of it and a few surfaces failed outright.
const CLAUDE_MAX_TURNS = 12;

// Exact ids rather than aliases: the model a review came from is recorded in
// the critique's scope.reviewer as provenance, and an alias would let that
// record point somewhere else the next time it is read.
const REVIEWER_MODELS = { codex: 'gpt-5.6-terra', claude: 'claude-opus-5' };
// Subtypes that name no cause. `no_agent_message` is the parser's own verdict
// on output it could not read, and a runner can report a failure whose subtype
// is still `success` — an API error does exactly that, carrying its real reason
// in `result` instead. Echoing either as the cause is worse than saying
// nothing: one labels a crash confidently, the other reports "success" as the
// reason a run failed.
const UNINFORMATIVE_FAILURE_SUBTYPES = new Set(['no_agent_message', 'success', 'error']);
// Enough of the runner's own words to name the cause, without pasting a whole
// transcript into one line of console output.
const FAILURE_DETAIL_MAX_CHARS = 200;

export function normalizeReviewerRunner(value) {
  return normalizeAgentRunner(value);
}

export function reviewerModelDefault(runner) {
  return REVIEWER_MODELS[normalizeReviewerRunner(runner)];
}

export function reviewerBinary(runner) {
  return agentRunnerDefaults(normalizeReviewerRunner(runner)).binary;
}

// Preferred order is REVIEWER_RUNNERS, so a machine with both reviews with the
// same runner every time rather than by whichever probe happened to answer.
export function detectReviewerRunner(available = hasCommand) {
  const found = REVIEWER_RUNNERS.find((runner) => available(reviewerBinary(runner)));
  if (!found) {
    throw new Error(
      `Page inventory critiques need one of ${REVIEWER_RUNNERS.map(reviewerBinary).join(' or ')} on PATH`
    );
  }
  return found;
}

// Copied rather than referenced in place so the image sits inside the working
// directory --restricted confines the reviewer to. The root is not empty — it
// also holds the output schema and, as a run proceeds, every previously staged
// capture; the staged copy is removed after each review so one reviewer cannot
// read another surface's evidence.
export function stageReviewerImage(runner, image, reviewerRoot, reviewId) {
  if (normalizeReviewerRunner(runner) === 'codex') return image;
  // Reviews run concurrently against one root, so the staged name carries the
  // review id; a fixed name would have parallel reviewers overwriting each
  // other's evidence and describing the wrong screen.
  const staged = join(reviewerRoot, `${reviewId}${extname(image)}`);
  copyFileSync(image, staged);
  return staged;
}

export function discardStagedImage(runner, staged) {
  if (normalizeReviewerRunner(runner) === 'codex') return;
  rmSync(staged, { force: true });
}

export function claudeReviewerPrompt(capture, image) {
  return `Read the image at ${image}. It is the only evidence; judge nothing else and assume nothing not visible in it.\n\n${capture.review_description}`;
}

function codexArgs({ capture, image, schema, model, effort, reviewerRoot }) {
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    reviewerRoot,
    '--image',
    image,
    '--output-schema',
    schema,
    '--model',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '-c',
    'approval_policy="never"',
    '-c',
    'features.multi_agent=false',
    '-c',
    'features.multi_agent_v2=false',
    capture.review_description,
  ];
}

function claudeArgs({ capture, image, schemaDocument, model, effort }) {
  return [
    '-p',
    claudeReviewerPrompt(capture, image),
    '--model',
    model,
    '--effort',
    effort,
    // The isolation half of what codex gets from `--sandbox read-only --cd`.
    // A temp cwd is not a boundary: `--allowedTools Read` pre-approves every
    // Read, absolute paths included, and without these a reviewer reads the
    // repo it is supposed to be judging blind — verified, with no denial
    // recorded. --restricted also ignores user and project settings, which is
    // codex's --ignore-user-config/--ignore-rules.
    '--restricted',
    '--strict-mcp-config',
    '--allowedTools',
    'Read',
    '--permission-mode',
    'default',
    '--json-schema',
    JSON.stringify(schemaDocument),
    '--max-turns',
    String(CLAUDE_MAX_TURNS),
    '--output-format',
    'json',
  ];
}

export function reviewerArgs({
  runner = 'codex',
  capture,
  image,
  schema,
  schemaDocument,
  model,
  effort,
  reviewerRoot,
}) {
  return normalizeReviewerRunner(runner) === 'codex'
    ? codexArgs({ capture, image, schema, model, effort, reviewerRoot })
    : claudeArgs({ capture, image, schemaDocument, model, effort });
}

// A runner that gives up says why in its own transcript — `error_max_turns`,
// say — but it also exits non-zero, and the caller rejects on the exit code
// before any of this is parsed. Without this the operator sees "exited 1: no
// stderr", which reads like a crash and gives no hint that the fix is a larger
// turn budget.
export function reviewerFailureReason(stdout) {
  if (!stdout?.trim()) return '';
  try {
    const { error, envelope } = parseSavedAgentOutput(stdout);
    if (!error) return '';
    const subtype = UNINFORMATIVE_FAILURE_SUBTYPES.has(error) ? '' : error;
    const detail = typeof envelope?.result === 'string' ? envelope.result.trim() : '';
    return (
      [subtype, detail.slice(0, FAILURE_DETAIL_MAX_CHARS)].filter(Boolean).join(': ') ||
      envelope?.terminal_reason ||
      ''
    );
  } catch {
    return '';
  }
}

// parseSavedAgentOutput normalizes both runners but reports an empty review as
// an empty object; a critique built from that would look like a pass nobody
// made, so a missing structure is an error here rather than a default.
export function parseReviewerOutput(raw, runner) {
  const parsed = parseSavedAgentOutput(raw);
  if (parsed.error) throw new Error(`reviewer failed: ${parsed.error}`);
  const structured = parsed.structured;
  if (!structured || typeof structured !== 'object' || !Object.keys(structured).length) {
    throw new Error(
      `reviewer returned no structured review${runner ? ` from ${reviewerBinary(runner)}` : ''}`
    );
  }
  return structured;
}
