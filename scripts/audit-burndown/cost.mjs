// cost.mjs — what has this burndown consumed, and what will the full run consume?
// Reads Claude JSON envelopes and Codex JSONL event streams from .audit-work/logs/.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSavedAgentOutput } from './agent-runner.mjs';
import { chdirRoot, countEntries, LOGS, WORK } from './lib.mjs';

chdirRoot();

const files = existsSync(LOGS) ? readdirSync(LOGS).filter((f) => f.endsWith('.json')) : [];
if (files.length === 0) {
  console.log('no run logs yet');
  process.exit(0);
}

const calls = files.map((file) => {
  const parsed = parseSavedAgentOutput(readFileSync(join(LOGS, file), 'utf8'));
  const envelope = parsed.envelope ?? {};
  return {
    file,
    runner: parsed.runner,
    cost: envelope.total_cost_usd ?? 0,
    turns: envelope.num_turns ?? 0,
    durationMs: envelope.duration_ms ?? 0,
    inputTokens: parsed.usage?.input_tokens ?? 0,
    cachedInputTokens: parsed.usage?.cached_input_tokens ?? 0,
    outputTokens: parsed.usage?.output_tokens ?? 0,
    error: parsed.error || (envelope.is_error === true ? (envelope.subtype ?? 'error') : ''),
  };
});

const sum = (list, key) => list.reduce((acc, e) => acc + (e[key] ?? 0), 0);
const fmtTokens = (tokens) => tokens.toLocaleString('en-US');

console.log('by role');
for (const role of ['verify', 'impl', 'review', 'fix']) {
  const roleCalls = calls.filter((call) => call.file.includes(`.${role}`));
  if (roleCalls.length === 0) continue;
  const cost = sum(roleCalls, 'cost');
  const tokens = sum(roleCalls, 'inputTokens') + sum(roleCalls, 'outputTokens');
  const metrics = [];
  if (cost) metrics.push(`$${cost.toFixed(4)}`);
  if (tokens) metrics.push(`${fmtTokens(tokens)} tokens`);
  console.log(
    `  ${role.padEnd(8)} ${String(roleCalls.length).padStart(3)} calls   ${metrics.join('   ') || 'no usage recorded'}`
  );
}

const totalCost = sum(calls, 'cost');
const totalInput = sum(calls, 'inputTokens');
const totalCached = sum(calls, 'cachedInputTokens');
const totalOutput = sum(calls, 'outputTokens');
const done = existsSync(join(WORK, 'completed.log'))
  ? readFileSync(join(WORK, 'completed.log'), 'utf8')
      .split('\n')
      .filter((l) => l.trim()).length
  : 0;
const remaining = countEntries() ?? 0;

console.log();
if (totalCost) console.log(`total spend    $${totalCost.toFixed(4)}`);
if (totalInput || totalOutput) {
  console.log(`input tokens   ${fmtTokens(totalInput)} (${fmtTokens(totalCached)} cached)`);
  console.log(`output tokens  ${fmtTokens(totalOutput)}`);
}
const turns = sum(calls, 'turns');
const durationMs = sum(calls, 'durationMs');
if (turns) console.log(`total turns    ${turns}`);
if (durationMs) console.log(`wall time      ${Math.floor(durationMs / 60000)} min`);

if (done > 0) {
  console.log();
  if (totalCost) {
    const perIssueCost = totalCost / done;
    console.log(`per issue      $${perIssueCost.toFixed(4)}`);
    console.log(
      `projected      $${(perIssueCost * remaining).toFixed(2)} to finish the remaining ${remaining}`
    );
  }
  if (totalInput || totalOutput) {
    const perIssueTokens = (totalInput + totalOutput) / done;
    console.log(`per issue      ${fmtTokens(Math.round(perIssueTokens))} tokens`);
    console.log(
      `projected      ${fmtTokens(Math.round(perIssueTokens * remaining))} tokens for the remaining ${remaining}`
    );
  }
}

console.log('\nany capped or errored calls');
const errored = calls.filter((call) => call.error);
if (errored.length === 0) console.log('  none');
const bySubtype = new Map();
for (const call of errored) {
  const key = call.error;
  bySubtype.set(key, (bySubtype.get(key) ?? 0) + 1);
}
for (const [subtype, count] of bySubtype) console.log(`  ${count}  ${subtype}`);
