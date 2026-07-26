import { describe, expect, it } from 'vitest';
import {
  agentAuthCommand,
  agentRunnerDefaults,
  codexArgs,
  codexRoleInstructions,
  normalizeAgentRunner,
  parseSavedAgentOutput,
} from '../audit-burndown/agent-runner.mjs';

describe('agent runner selection', () => {
  it('keeps Claude as the backward-compatible default', () => {
    expect(normalizeAgentRunner()).toBe('claude');
    expect(agentRunnerDefaults().implementModel).toBe('claude-opus-5');
  });

  it('maps Sonnet-tier work to Terra and Opus-tier work to Sol for Codex', () => {
    expect(agentRunnerDefaults('codex')).toMatchObject({
      binary: 'codex',
      verifyModel: 'gpt-5.6-terra',
      implementModel: 'gpt-5.6-sol',
      minorImplementModel: 'gpt-5.6-terra',
      reviewModel: 'gpt-5.6-sol',
    });
  });

  it('fails closed on an unknown runner', () => {
    expect(() => normalizeAgentRunner('other')).toThrow('unsupported AGENT_RUNNER');
  });

  it('uses each runner’s native authentication probe', () => {
    expect(agentAuthCommand('claude')).toMatchObject({
      cmd: 'claude',
      args: ['auth', 'status'],
    });
    expect(agentAuthCommand('codex')).toMatchObject({
      cmd: 'codex',
      args: ['login', 'status'],
    });
  });
});

describe('Codex invocation', () => {
  const base = {
    prompt: 'do the work',
    model: 'gpt-5.6-sol',
    effort: 'high',
    role: 'implement',
    schemaPath: '.audit-work/schemas/implement.json',
    root: '/repo',
  };

  it('starts a workspace-write session with schema output and delegation disabled', () => {
    const args = codexArgs(base);
    expect(args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(args).toContain('gpt-5.6-sol');
    expect(args).toContain('model_reasoning_effort="high"');
    expect(args).toContain('features.multi_agent=false');
    expect(args).toContain('features.multi_agent_v2=false');
    expect(args).toContain('workspace-write');
    expect(args).toContain('/repo');
    expect(args.at(-1)).toBe('do the work');
  });

  it('resumes the exact implementer thread instead of starting another', () => {
    const args = codexArgs({ ...base, sessionId: 'thread-123' });
    expect(args.slice(0, 3)).toEqual(['exec', 'resume', '--json']);
    expect(args).toContain('thread-123');
    expect(args).not.toContain('workspace-write');
    expect(args.at(-1)).toBe('do the work');
  });

  it('makes reviewer sessions structurally read-only', () => {
    const args = codexArgs({ ...base, role: 'review' });
    expect(args).toContain('read-only');
  });

  it('leaves listener-based E2E to the outer driver', () => {
    const instructions = codexRoleInstructions('implement');
    expect(instructions).toContain('Do not run Playwright');
    expect(instructions).toContain('outside this nested sandbox');
    expect(instructions).toContain('Commit when');
    expect(codexRoleInstructions('review')).toBe('');
  });
});

describe('saved agent output parsing', () => {
  it('normalizes a Claude structured-output envelope', () => {
    const parsed = parseSavedAgentOutput(
      JSON.stringify({
        session_id: 'claude-session',
        is_error: false,
        structured_output: { verdict: 'VALID' },
      })
    );
    expect(parsed).toMatchObject({
      runner: 'claude',
      sessionId: 'claude-session',
      structured: { verdict: 'VALID' },
      error: '',
    });
  });

  it('keeps a Claude tooling error attributed to Claude', () => {
    const parsed = parseSavedAgentOutput(
      JSON.stringify({ is_error: true, subtype: 'error_max_budget_usd' })
    );
    expect(parsed).toMatchObject({
      runner: 'claude',
      error: 'error_max_budget_usd',
    });
  });

  it('normalizes Codex JSONL, including its authoritative thread and usage', () => {
    const raw = [
      JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"success":true,"sha":"abc","summary":"done"}' },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 },
      }),
    ].join('\n');
    const parsed = parseSavedAgentOutput(raw);
    expect(parsed).toMatchObject({
      runner: 'codex',
      sessionId: 'codex-thread',
      structured: { success: true, sha: 'abc', summary: 'done' },
      usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 },
      error: '',
    });
  });

  it('reports a Codex turn failure instead of treating it as a model verdict', () => {
    const raw = [
      JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread' }),
      JSON.stringify({ type: 'turn.failed', error: { message: 'usage limit reached' } }),
    ].join('\n');
    expect(parseSavedAgentOutput(raw)).toMatchObject({
      runner: 'codex',
      error: 'usage limit reached',
      structured: {},
    });
  });
});
