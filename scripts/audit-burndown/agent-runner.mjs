import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDE_TOOLS = {
  verify: {
    available: 'Read,Grep,Glob,Write,Bash',
    allowed:
      'Read,Grep,Glob,Write,Bash(git show *),Bash(git log *),Bash(git rev-parse *),Bash(rg *),Bash(grep *),Bash(mkdir *)',
    permissionMode: 'acceptEdits',
  },
  implement: {
    available: 'Read,Edit,Write,Grep,Glob,Bash',
    allowed:
      'Read,Edit,Write,Grep,Glob,Bash(npm *),Bash(npx *),Bash(node *),Bash(git add *),Bash(git commit *),Bash(git status *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git rev-parse *),Bash(rg *),Bash(grep *)',
    permissionMode: 'acceptEdits',
  },
  review: {
    available: 'Read,Grep,Glob,Bash',
    allowed:
      'Read,Grep,Glob,Bash(git show *),Bash(git diff *),Bash(git log *),Bash(git rev-parse *),Bash(rg *),Bash(grep *)',
    permissionMode: 'dontAsk',
  },
};

const CODEX_SANDBOX = {
  verify: 'workspace-write',
  implement: 'workspace-write',
  review: 'read-only',
};

const CODEX_ROLE_INSTRUCTIONS = {
  implement: `## Codex runner boundary

This role runs inside a nested workspace-write sandbox that cannot bind a localhost listener or
write Git metadata. The driver runs every verifier-selected Playwright spec and creates the commit
outside this nested sandbox before adversarial review.

* Do not run Playwright, an E2E command, or a dev/preview server, even when the brief lists it.
* Run the remaining acceptance commands that do not open a listener: type-check, unit tests, and
  scoped lint.
* Do not run \`git add\`, \`git commit\`, reset, restore, or otherwise mutate Git state. Leave the
  completed changes in the worktree.
* When the implementation and non-listener checks pass, return \`success=true\` with an empty
  \`sha\`. Do not report failure merely because E2E and the commit belong to the driver.

The driver stages exactly your changed paths, rejects protected audit-state edits, commits, and
rolls the commit back if a deterministic gate fails.`,
};

export function normalizeAgentRunner(value) {
  const runner = value || 'claude';
  if (runner !== 'claude' && runner !== 'codex') {
    throw new Error(`unsupported AGENT_RUNNER: ${runner}`);
  }
  return runner;
}

export function agentRunnerDefaults(runnerValue) {
  const runner = normalizeAgentRunner(runnerValue);
  if (runner === 'codex') {
    return {
      binary: 'codex',
      verifyModel: 'gpt-5.6-terra',
      implementModel: 'gpt-5.6-sol',
      minorImplementModel: 'gpt-5.6-terra',
      reviewModel: 'gpt-5.6-sol',
    };
  }
  return {
    binary: 'claude',
    verifyModel: 'sonnet',
    implementModel: 'claude-opus-5',
    minorImplementModel: 'sonnet',
    reviewModel: 'claude-opus-5',
  };
}

export function agentAuthCommand(runnerValue) {
  const runner = normalizeAgentRunner(runnerValue);
  return runner === 'codex'
    ? { cmd: 'codex', args: ['login', 'status'], login: 'codex login' }
    : { cmd: 'claude', args: ['auth', 'status'], login: 'claude auth login' };
}

export function parseSavedAgentOutput(raw) {
  try {
    const envelope = JSON.parse(raw);
    if (
      envelope &&
      !Array.isArray(envelope) &&
      ('structured_output' in envelope ||
        'session_id' in envelope ||
        'is_error' in envelope ||
        'subtype' in envelope)
    ) {
      return {
        runner: 'claude',
        structured: envelope.structured_output ?? {},
        sessionId: envelope.session_id ?? '',
        usage: {},
        envelope,
        error: envelope.is_error === true ? (envelope.subtype ?? 'error') : '',
      };
    }
  } catch {
    // Codex emits JSONL, so a whole-document parse is expected to fail.
  }

  const events = raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const sessionId = events.find((event) => event.type === 'thread.started')?.thread_id ?? '';
  const messages = events
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item.text);
  let structured;
  try {
    structured = messages.length ? JSON.parse(messages.at(-1)) : {};
  } catch {
    structured = {};
  }
  const completed = events.findLast((event) => event.type === 'turn.completed');
  const failed = events.findLast((event) => event.type === 'turn.failed' || event.type === 'error');
  return {
    runner: 'codex',
    structured,
    sessionId,
    usage: completed?.usage ?? {},
    envelope: { events },
    error:
      failed?.error?.message ?? failed?.message ?? (!messages.length ? 'no_agent_message' : ''),
  };
}

export function codexArgs({ prompt, model, effort, role, schemaPath, sessionId = '', root }) {
  const shared = [
    '--json',
    '--output-schema',
    schemaPath,
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
  ];
  if (sessionId) return ['exec', 'resume', ...shared, sessionId, prompt];
  return ['exec', ...shared, '--sandbox', CODEX_SANDBOX[role], '--cd', root, prompt];
}

function claudeArgs({
  prompt,
  systemPromptFile,
  model,
  effort,
  role,
  schema,
  maxTurns,
  budget,
  sessionId,
}) {
  const tools = CLAUDE_TOOLS[role];
  const args = ['-p', prompt];
  if (sessionId) args.push('--resume', sessionId);
  else args.push('--append-system-prompt-file', systemPromptFile);
  if (model) args.push('--model', model);
  args.push(
    '--effort',
    effort,
    '--tools',
    tools.available,
    '--allowedTools',
    tools.allowed,
    '--permission-mode',
    tools.permissionMode,
    '--json-schema',
    JSON.stringify(schema),
    '--max-turns',
    String(maxTurns),
    '--max-budget-usd',
    budget,
    '--output-format',
    'json'
  );
  return args;
}

export function codexRoleInstructions(role) {
  return CODEX_ROLE_INSTRUCTIONS[role] ?? '';
}

function codexPrompt(prompt, systemPromptFile, sessionId, role) {
  if (sessionId) return prompt;
  const rolePrompt = readFileSync(systemPromptFile, 'utf8').trim();
  const runnerInstructions = codexRoleInstructions(role);
  return `${rolePrompt}${runnerInstructions ? `\n\n${runnerInstructions}` : ''}\n\n## Current task\n\n${prompt}`;
}

export async function runAgentStep({
  runner: runnerValue,
  tag,
  prompt,
  systemPromptFile,
  model,
  effort,
  role,
  schema,
  maxTurns,
  budget,
  sessionId = '',
  retries,
  root,
  workDir,
  logsDir,
  runCmd,
  logLine,
  sleep,
}) {
  const runner = normalizeAgentRunner(runnerValue);
  mkdirSync(logsDir, { recursive: true });
  let last = {
    ok: false,
    structured: {},
    sessionId,
    runner,
    parsed: {},
  };

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let mintedSession = sessionId;
    let cmd;
    let args;

    if (runner === 'claude') {
      if (!mintedSession) mintedSession = randomUUID();
      cmd = 'claude';
      args = claudeArgs({
        prompt,
        systemPromptFile,
        model,
        effort,
        role,
        schema,
        maxTurns,
        budget,
        sessionId,
      });
      if (!sessionId) args.push('--session-id', mintedSession);
    } else {
      const schemaDir = join(workDir, 'schemas');
      mkdirSync(schemaDir, { recursive: true });
      const schemaPath = join(schemaDir, `${role}.json`);
      writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
      cmd = 'codex';
      args = codexArgs({
        prompt: codexPrompt(prompt, systemPromptFile, sessionId, role),
        model,
        effort,
        role,
        schemaPath,
        sessionId,
        root,
      });
    }

    const result = runCmd(cmd, args);
    const out = result.stdout ?? '';
    writeFileSync(join(logsDir, `${tag}.json`), out);
    if (result.stderr) appendFileSync(join(logsDir, `${tag}.err`), result.stderr);

    const parsed = parseSavedAgentOutput(out);
    const resolvedSession = sessionId || (runner === 'claude' ? mintedSession : parsed.sessionId);
    const ok =
      result.status === 0 &&
      !parsed.error &&
      parsed.structured &&
      Object.keys(parsed.structured).length > 0;
    last = {
      ok,
      structured: parsed.structured ?? {},
      sessionId: resolvedSession,
      runner,
      parsed,
    };
    if (ok) return last;

    const subtype =
      runner === 'claude'
        ? (parsed.envelope?.subtype ?? 'no_output')
        : parsed.error || `exit_${result.status ?? 'unknown'}`;
    if (
      runner === 'claude' &&
      (subtype === 'error_max_budget_usd' || subtype === 'error_max_turns')
    ) {
      logLine(`  ${tag} hit a cap (${subtype}) — not retrying`);
      return last;
    }

    const waitSeconds = attempt * attempt * 30;
    logLine(
      `  ${tag} attempt ${attempt}/${retries} failed (${subtype}) — backing off ${waitSeconds}s`
    );
    await sleep(waitSeconds * 1000);
  }
  return last;
}
